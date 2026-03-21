// config/SecurityConfig.java
package DeadValut.Main.config;

import DeadValut.Main.service.JwtService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtService jwtService;

    public SecurityConfig(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // Disable CSRF — stateless JWT API, no session cookies
            .csrf(AbstractHttpConfigurer::disable)

            // No session — every request must carry a JWT
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            // Disable Spring's default form login and HTTP Basic pop-up
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)

            .authorizeHttpRequests(auth -> auth
                // SIWE auth endpoints — public
                .requestMatchers(HttpMethod.GET,  "/api/auth/nonce").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/verify").permitAll()

                // Actuator endpoints — ** is required to match /actuator/health, /actuator/info, etc.
                .requestMatchers("/actuator", "/actuator/**").permitAll()

                .requestMatchers("/actuator/health", "/actuator/info").permitAll()

                // Allow Spring to show real errors instead of 403s!
                .requestMatchers("/error").permitAll()

                // Everything else requires a valid JWT
                .anyRequest().authenticated()
            )

            // Plug in JWT extraction before Spring's username/password filter.
            // jwtAuthFilter() is NOT a @Bean — calling the method directly creates
            // a plain instance that Spring Security owns. If it were a @Bean, Spring
            // Boot's FilterRegistrationBean auto-detection would also register it as
            // a raw servlet filter, causing it to execute twice per request.
            .addFilterBefore(jwtAuthFilter(), UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * NOT annotated with @Bean intentionally.
     *
     * Spring Boot auto-registers every OncePerRequestFilter bean as a servlet filter.
     * If this were a @Bean it would run once outside the security chain (via the
     * servlet container) AND once inside it (via addFilterBefore), corrupting the
     * SecurityContext and causing permit-all rules to be ignored for some requests.
     *
     * By returning a plain instance here, only Spring Security manages its lifecycle.
     */
    public OncePerRequestFilter jwtAuthFilter() {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request,
                                            HttpServletResponse response,
                                            FilterChain chain)
                    throws ServletException, IOException {

                String header = request.getHeader("Authorization");

                if (header != null && header.startsWith("Bearer ")) {
                    String token = header.substring(7);
                    try {
                        if (jwtService.isValid(token)) {
                            UUID userId = jwtService.extractUserId(token);

                            UsernamePasswordAuthenticationToken auth =
                                new UsernamePasswordAuthenticationToken(
                                    userId,   // principal — injected via @AuthenticationPrincipal
                                    null,     // credentials — not needed post-authentication
                                    List.of() // authorities — none required for this app
                                );
                            SecurityContextHolder.getContext().setAuthentication(auth);
                        }
                    } catch (Exception ignored) {
                        // Invalid/expired token — SecurityContext stays empty → 403 downstream
                    }
                }

                chain.doFilter(request, response);
            }
        };
    }
}