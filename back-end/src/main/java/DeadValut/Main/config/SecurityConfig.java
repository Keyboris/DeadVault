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
                // ==========================================
                // 🔓 PUBLIC ENDPOINTS (No Auth Required)
                // ==========================================
                
                // 1. Authentication (SIWE)
                .requestMatchers(HttpMethod.GET,  "/api/auth/nonce").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/verify").permitAll()
                
                // 2. Hackathon Testing (Free-form Solidity Generator)
                .requestMatchers(HttpMethod.POST, "/api/contracts/generate").permitAll()

                // 3. Health & Monitoring
                .requestMatchers("/actuator/**").permitAll()

                // 4. Global Error Handler (Prevents Spring from hiding 404s/500s behind a 403)
                .requestMatchers("/error").permitAll()

                // ==========================================
                // 🔒 SECURED ENDPOINTS (Requires valid JWT)
                // ==========================================
                // This catch-all automatically secures the following from your API Ref:
                // - POST /api/will
                // - PUT  /api/will
                // - POST /api/check-in
                // - GET  /api/check-in/status
                // - GET  /api/vault/balance
                .anyRequest().authenticated()
            )

            // Plug in JWT extraction before Spring's username/password filter.
            .addFilterBefore(jwtAuthFilter(), UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * NOT annotated with @Bean intentionally.
     * Spring Boot auto-registers every OncePerRequestFilter bean as a servlet filter.
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