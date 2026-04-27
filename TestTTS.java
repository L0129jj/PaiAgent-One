import com.alibaba.dashscope.audio.ttsv2.SpeechSynthesisParam;
import com.alibaba.dashscope.audio.ttsv2.SpeechSynthesizer;
import java.nio.ByteBuffer;
public class TestTTS {
    public static void main(String[] args) throws Exception {
        SpeechSynthesisParam param = SpeechSynthesisParam.builder()
            .apiKey("sk-8c86fe89446848429434910a2fdb9d1a")
            .model("cosyvoice-v1")
            .voice("longxiaochun")
            .format("mp3")
            .build();
        SpeechSynthesizer synthesizer = new SpeechSynthesizer(param, null);
        ByteBuffer buffer = synthesizer.call("你好，这是一次测试。");
        System.out.println("Buffer null? " + (buffer == null));
    }
}
