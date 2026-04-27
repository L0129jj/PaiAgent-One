package com.paiagent.service;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URL;
import java.util.UUID;

@Service
public class MinioService {
    private static final Logger logger = LoggerFactory.getLogger(MinioService.class);

    private final MinioClient minioClient;
    private final String bucketName;
    private final String publicUrl;

    public MinioService(MinioClient minioClient, 
                        @Value("${minio.bucketName}") String bucketName,
                        @Value("${minio.publicUrl}") String publicUrl) {
        this.minioClient = minioClient;
        this.bucketName = bucketName;
        this.publicUrl = publicUrl;
        ensureBucketExists();
    }

    private void ensureBucketExists() {
        logger.info("Initializing MinIO connection to bucket: {}", bucketName);
        try {
            boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build());
            if (!exists) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
                logger.info("MinIO bucket '{}' created successfully.", bucketName);
            } else {
                logger.info("MinIO bucket '{}' already exists.", bucketName);
            }
        } catch (Exception e) {
            logger.error("CRITICAL: Failed to connect to MinIO. Please check if MinIO is running and credentials are correct. Error: {}", e.getMessage());
        }
    }

    /**
     * 从远程 URL 下载并上传到 MinIO
     */
    public String uploadFromUrl(String remoteUrl) {
        if (remoteUrl == null || !remoteUrl.startsWith("http")) {
            return remoteUrl;
        }
        try {
            logger.info("Downloading audio from remote URL: {}", remoteUrl);
            try (InputStream inputStream = new URL(remoteUrl).openStream()) {
                byte[] bytes = inputStream.readAllBytes();
                return uploadAudio(bytes);
            }
        } catch (Exception e) {
            logger.error("Failed to transfer remote audio to MinIO: {}", remoteUrl, e);
            return remoteUrl; // 失败则返回原 URL
        }
    }

    /**
     * 上传字节数组到 MinIO 并返回可访问的 URL
     */
    public String uploadAudio(byte[] audioBytes) {
        String fileName = "audio/" + UUID.randomUUID().toString() + ".mp3";
        try {
            ByteArrayInputStream inputStream = new ByteArrayInputStream(audioBytes);
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(fileName)
                            .stream(inputStream, audioBytes.length, -1)
                            .contentType("audio/mpeg")
                            .build()
            );
            
            String url = publicUrl + "/" + bucketName + "/" + fileName;
            logger.info("Audio uploaded to MinIO: {}", url);
            return url;
        } catch (Exception e) {
            logger.error("Failed to upload audio to MinIO", e);
            throw new RuntimeException("MinIO upload failed", e);
        }
    }
}
