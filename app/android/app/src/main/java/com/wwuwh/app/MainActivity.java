package com.wwuwh.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Enable edge-to-edge display so safe-area-insets are reported to the WebView
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
