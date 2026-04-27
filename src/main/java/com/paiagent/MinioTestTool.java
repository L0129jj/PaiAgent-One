package com.paiagent;

import io.minio.BucketExistsArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import java.io.ByteArrayInputStream;

public class MinioTestTool {
    public static void main(String[] args) {
        // 使用您最新的配置进行测试
        String endpoint = "http://127.0.0.1:9005";
        String accessKey = "admin123";
        String secretKey = "12345678";
        String bucketName = "paiagent";

        System.out.println("Testing MinIO connection to: " + endpoint);
        
        try {
            MinioClient minioClient = MinioClient.builder()
                    .endpoint(endpoint)
                    .credentials(accessKey, secretKey)
                    .build();

            // 1. 检查连接
            boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build());
            System.out.println("Connection successful! Bucket '" + bucketName + "' exists: " + exists);

            // 2. 尝试上传
            byte[] dummyData = "test audio content".getBytes();
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object("test-connection.txt")
                            .stream(new ByteArrayInputStream(dummyData), dummyData.length, -1)
                            .contentType("text/plain")
                            .build()
            );
            System.out.println("Successfully uploaded a test file to MinIO!");
            
        } catch (Exception e) {
            System.err.println("FAILED to connect or upload to MinIO:");
            System.err.println("Error details: " + e.getMessage());
            System.err.println("\nPossible reasons:");
            System.err.println("1. MinIO is not running on 9005");
            System.err.println("2. AccessKey/SecretKey are incorrect (try 'minioadmin')");
            System.err.println("3. The bucket 'paiagent' does not exist and user has no permission to create it");
        }
    }
}
