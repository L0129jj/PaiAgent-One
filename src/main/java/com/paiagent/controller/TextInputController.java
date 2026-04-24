package com.paiagent.controller;

import com.paiagent.dto.TextInputRequest;
import com.paiagent.entity.TextInputRecord;
import com.paiagent.entity.User;
import com.paiagent.interceptor.AuthInterceptor;
import com.paiagent.service.TextInputService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/text-input")
public class TextInputController {

    @Autowired
    private TextInputService textInputService;

    @PostMapping
    public ResponseEntity<Map<String, Object>> save(
            HttpServletRequest servletRequest,
            @RequestBody TextInputRequest body) {
        try {
            User user = getCurrentUser(servletRequest);
            TextInputRecord record = textInputService.saveInput(user, body.getInputText());
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "id", record.getId(),
                    "inputText", record.getInputText(),
                    "createdAt", String.valueOf(record.getCreatedAt())
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "success", false,
                    "error", e.getMessage()
            ));
        }
    }

    @GetMapping("/recent")
    public ResponseEntity<Map<String, Object>> recent(
            HttpServletRequest request,
            @RequestParam(defaultValue = "10") int limit) {
        try {
            User user = getCurrentUser(request);
            List<TextInputRecord> records = textInputService.recent(user, limit);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "records", records
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "success", false,
                    "error", e.getMessage()
            ));
        }
    }

    private User getCurrentUser(HttpServletRequest servletRequest) {
        Object user = servletRequest.getAttribute(AuthInterceptor.AUTH_USER_ATTR);
        if (!(user instanceof User)) {
            throw new IllegalArgumentException("登录状态已失效，请重新登录");
        }
        return (User) user;
    }
}
