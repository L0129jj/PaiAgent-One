package com.paiagent.config;

import com.paiagent.interceptor.AuthInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Autowired
    private AuthInterceptor authInterceptor;

    @Autowired
    private AuthPathProperties authPathProperties;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        String[] includePaths = authPathProperties.getIncludePaths().toArray(new String[0]);
        String[] excludePaths = authPathProperties.getExcludePaths().toArray(new String[0]);

        registry.addInterceptor(authInterceptor)
                .addPathPatterns(includePaths)
                .excludePathPatterns(excludePaths);
    }
}
