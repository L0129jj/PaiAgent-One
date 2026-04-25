package com.paiagent.controller;

import com.paiagent.service.AudioService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 音频播放 Controller。
 * 提供 /api/audio/play/{audioId} 端点，返回缓存的 TTS 音频流。
 */
@RestController
@RequestMapping("/api/audio")
public class AudioController {
    private static final Logger logger = LoggerFactory.getLogger(AudioController.class);

    @Autowired
    private AudioService audioService;

    @GetMapping("/play/{audioId}")
    public ResponseEntity<byte[]> playAudio(@PathVariable String audioId) {
        byte[] audioBytes = audioService.getCachedAudio(audioId);
        if (audioBytes == null) {
            return ResponseEntity.notFound().build();
        }

        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.CONTENT_TYPE, "audio/wav");
        headers.setContentLength(audioBytes.length);
        headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"tts.wav\"");

        return new ResponseEntity<>(audioBytes, headers, HttpStatus.OK);
    }
}
