package ir.frame.nama;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // v0.12.0 — native player / downloads / in-app self-update bridge
        registerPlugin(NamaNativePlugin.class);
    }
}
