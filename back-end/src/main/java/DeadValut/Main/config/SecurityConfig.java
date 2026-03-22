// config/SecurityConfig.java  (UPDATED — keyholder route permissions)
package DeadValut.Main.config;

import DeadValut.Main.service.JwtService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtService jwtService;
    private final String allowedOrigins;

    public SecurityConfig(
            JwtService jwtService,
            @Value("${dms.cors.allowed-origins:http://localhost:3000,http://127.0.0.1:3000,http://localhost:4173,http://127.0.0.1:4173,http://192.168.*:3000,http://192.168.*:4173,http://172.*:3000,http://172.*:4173}")
            String allowedOrigins
    ) {
        this.jwtService     = jwtService;
        this.allowedOrigins = allowedOrigins;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)

            .authorizeHttpRequests(auth -> auth
                // ==========================================
                // 🔓 PUBLIC ENDPOINTS (No Auth Required)
                // ==========================================

                // 1. Authentication (SIWE)
                .requestMatchers(HttpMethod.GET,  "/api/auth/nonce").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/verify").permitAll()
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                // 2. Hackathon Testing (Free-form Solidity Generator)
                .requestMatchers(HttpMethod.POST, "/api/contracts/generate").permitAll()

                // 3. Health & Monitoring
                .requestMatchers("/actuator/**").permitAll()

                // 4. Global Error Handler
                .requestMatchers("/error").permitAll()

                // 5. Keyholder confirmation-round read (keyholders look up the
                //    pending round for a vault owner by userId query param).
                //    Requires a valid JWT but the wallet doesn't have to be the owner.
                .requestMatchers(HttpMethod.GET,  "/api/keyholders/confirmation-round").authenticated()

                // 6. Keyholder vote endpoint — any authenticated user whose wallet is
                //    a registered keyholder for the relevant vault may call this.
                .requestMatchers(HttpMethod.POST, "/api/keyholders/confirm").authenticated()

                // ==========================================
                // 🔒 SECURED ENDPOINTS (Requires valid JWT)
                // ==========================================
                .anyRequest().authenticated()
            )

            .addFilterBefore(jwtAuthFilter(), UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        List<String> origins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();

        List<String> exactOrigins = origins.stream()
                .filter(origin -> !origin.contains("*"))
                .toList();

        List<String> patternOrigins = origins.stream()
                .filter(origin -> origin.contains("*"))
                .toList();

        if (!exactOrigins.isEmpty()) {
            config.setAllowedOrigins(exactOrigins);
        }
        if (!patternOrigins.isEmpty()) {
            config.setAllowedOriginPatterns(patternOrigins);
        }
        if (exactOrigins.isEmpty() && patternOrigins.isEmpty()) {
            config.setAllowedOrigins(List.of("http://localhost:3000"));
        }

        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept",
                                          "Origin", "X-Requested-With"));
        config.setExposedHeaders(List.of("Authorization"));
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
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
                                    userId,
                                    null,
                                    List.of()
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