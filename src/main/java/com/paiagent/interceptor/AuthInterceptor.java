package com.paiagent.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.paiagent.config.AuthPathProperties;
import com.paiagent.entity.User;
import com.paiagent.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Map;

@Component
public class AuthInterceptor implements HandlerInterceptor {
    public static final String AUTH_USER_ATTR = "AUTH_USER";

    @Autowired
    private AuthService authService;

    @Autowired
    private AuthPathProperties authPathProperties;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String token = request.getHeader(authPathProperties.getTokenHeader());
        if (token == null || token.isBlank()) {
            writeUnauthorized(response, "缺少登录令牌");
            return false;
        }

        try {
            User user = authService.requireUserByToken(token);
            request.setAttribute(AUTH_USER_ATTR, user);
            return true;
        } catch (Exception e) {
            writeUnauthorized(response, e.getMessage());
            return false;
        }
    }

    private void writeUnauthorized(HttpServletResponse response, String message) throws Exception {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(Map.of(
                "success", false,
                "error", message
        )));
    }
}
