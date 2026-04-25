package com.paiagent.controller;

import com.paiagent.dto.AuthRequest;
import com.paiagent.entity.User;
import com.paiagent.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody AuthRequest request) {
        User user = authService.register(request.getUsername(), request.getPassword());
        return ResponseEntity.ok(Map.of(
                "success", true,
                "userId", user.getId(),
                "username", user.getUsername()
        ));
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody AuthRequest request) {
        AuthService.LoginResult result = authService.login(request.getUsername(), request.getPassword());
        return ResponseEntity.ok(Map.of(
                "success", true,
                "token", result.getToken(),
                "userId", result.getUserId(),
                "username", result.getUsername()
        ));
    }
}
