package com.paiagent.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.paiagent.entity.TextInputRecord;
import com.paiagent.entity.User;
import com.paiagent.mapper.TextInputRecordMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class TextInputService {

    @Autowired
    private TextInputRecordMapper textInputRecordMapper;

    public TextInputRecord saveInput(User user, String inputText) {
        if (inputText == null || inputText.isBlank()) {
            throw new IllegalArgumentException("输入文本不能为空");
        }

        TextInputRecord record = new TextInputRecord();
        record.setUserId(user.getId());
        record.setInputText(inputText.trim());
        record.setCreatedAt(LocalDateTime.now());
        textInputRecordMapper.insert(record);
        return record;
    }

    public List<TextInputRecord> recent(User user, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 20));
        return textInputRecordMapper.selectList(new LambdaQueryWrapper<TextInputRecord>()
                .eq(TextInputRecord::getUserId, user.getId())
                .orderByDesc(TextInputRecord::getCreatedAt)
                .last("LIMIT " + safeLimit));
    }
}
