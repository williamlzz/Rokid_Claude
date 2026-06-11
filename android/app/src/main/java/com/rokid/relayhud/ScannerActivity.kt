package com.rokid.relayhud

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.wifi.WifiNetworkSuggestion
import android.os.Bundle
import android.provider.Settings
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.zxing.BinaryBitmap
import com.google.zxing.NotFoundException
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import java.util.concurrent.Executors

/** 离线自救主入口:相机取景 + ZXing 逐帧解 WiFi 二维码 → 系统保存网络对话框。 */
class ScannerActivity : ComponentActivity() {
    private val s by lazy { strings(loadLang()) }
    private val status = mutableStateOf("")
    @Volatile private var handled = false              // 命中一次后停止处理后续帧
    private val analysisExec = Executors.newSingleThreadExecutor()
    private val reader = QRCodeReader()
    private val pendingConfig = mutableStateOf<AppConfig?>(null)  // 待确认的配置码

    private val requestCamera =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera()
            else { status.value = s.cameraDenied; finish() }
        }
    private val addNetwork =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
            if (res.resultCode == RESULT_OK) { status.value = s.wifiSaved; finish() }
            else { status.value = s.wifiNotSaved; handled = false }   // 用户取消 → 继续扫
        }

    private fun loadLang(): String = try {
        val f = java.io.File(getExternalFilesDir(null), "config.json")
        if (f.exists()) parseConfig(f.readText()).lang else "zh"
    } catch (_: Exception) { "zh" }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        status.value = s.scanHint
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) startCamera()
        else requestCamera.launch(Manifest.permission.CAMERA)
    }

    private fun startCamera() {
        val previewView = PreviewView(this)
        setContent {
            Box(Modifier.fillMaxSize()) {
                AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())
                val pc = pendingConfig.value
                if (pc != null) {
                    Text(
                        "${s.connectTo}\n${pc.serverUrl}\n\n${s.confirmHint}",
                        color = Color(0xFF00FF88), fontSize = 14.sp,
                        modifier = Modifier.align(Alignment.Center).padding(16.dp),
                    )
                } else {
                    Text(
                        status.value, color = Color(0xFF00FF88), fontSize = 14.sp,
                        modifier = Modifier.align(Alignment.BottomCenter).padding(12.dp),
                    )
                }
            }
        }
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            val provider = future.get()
            val preview = Preview.Builder().build()
                .also { it.setSurfaceProvider(previewView.surfaceProvider) }
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            analysis.setAnalyzer(analysisExec) { proxy -> decode(proxy) }
            provider.unbindAll()
            provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
        }, ContextCompat.getMainExecutor(this))
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (pendingConfig.value != null) {
            if (keyCode == KeyEvent.KEYCODE_BACK) {     // 双击=取消,回扫描
                pendingConfig.value = null; status.value = s.scanHint; handled = false; return true
            }
            if (Gestures.map(keyCode, KeyEvent.ACTION_UP) == GestureAction.TAP) {  // 单击=确认
                applyConfig(pendingConfig.value!!); return true
            }
            return true   // 确认态吞掉其它键
        }
        return super.onKeyUp(keyCode, event)
    }

    /** 写 config.json 并重启 MainActivity 用新地址重连。写失败则提示、回扫描。 */
    private fun applyConfig(cfg: AppConfig) {
        try {
            // 目录归本 app(可删文件),但 adb push 进来的旧 config.json 属主是 shell、本 app 无法直接覆盖(EACCES)。
            // 先删旧文件再写:新文件归本 app,可写。全新安装(无文件)时 delete 是 no-op。
            val f = java.io.File(getExternalFilesDir(null), "config.json")
            f.delete()
            f.writeText(configToJson(cfg))
        } catch (_: Exception) {
            status.value = s.wifiNotSaved; pendingConfig.value = null; handled = false; return
        }
        status.value = s.configApplied
        startActivity(
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        )
        finish()
    }

    private fun decode(image: ImageProxy) {
        if (handled) { image.close(); return }
        try {
            val plane = image.planes[0]
            val buffer = plane.buffer
            val bytes = ByteArray(buffer.remaining()); buffer.get(bytes)
            val source = PlanarYUVLuminanceSource(
                bytes, plane.rowStride, image.height, 0, 0, image.width, image.height, false)
            val text = reader.decode(BinaryBitmap(HybridBinarizer(source))).text
            val wifi = parseWifiQr(text)
            val cfg = if (wifi == null) parseConfigQr(text) else null
            runOnUiThread {
                when {
                    handled -> {}
                    wifi != null -> { handled = true; saveNetwork(wifi) }
                    cfg != null -> { handled = true; pendingConfig.value = cfg; status.value = "" }
                    else -> status.value = s.unknownQr
                }
            }
        } catch (_: NotFoundException) {
            // 这一帧没扫到码,继续下一帧
        } catch (_: Exception) {
            // 其它解码异常忽略,继续
        } finally {
            reader.reset()
            image.close()
        }
    }

    private fun saveNetwork(wifi: WifiQr) {
        val open = wifi.type.equals("nopass", ignoreCase = true) || wifi.password.isEmpty()
        val builder = WifiNetworkSuggestion.Builder().setSsid(wifi.ssid)
        if (!open) builder.setWpa2Passphrase(wifi.password)
        if (wifi.hidden) builder.setIsHiddenSsid(true)
        val list = arrayListOf(builder.build())
        val intent = Intent(Settings.ACTION_WIFI_ADD_NETWORKS)
            .putParcelableArrayListExtra(Settings.EXTRA_WIFI_NETWORK_LIST, list)
        addNetwork.launch(intent)
    }

    override fun onDestroy() {
        super.onDestroy()
        analysisExec.shutdown()
    }
}
