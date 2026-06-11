package com.rokid.relayhud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StringsTest {
    @Test fun zhAndEnDiffer() {
        assertEquals("就绪", strings("zh").ready)
        assertEquals("Ready", strings("en").ready)
        assertEquals("Confirm", strings("en").confirm)
        assertEquals("Select model", strings("en").selectModel)
    }
    @Test fun unknownLangFallsBackZh() {
        assertEquals("就绪", strings("fr").ready)
    }
    @Test fun newSessionMatch() {
        assertTrue(matchesNewSession("new session", "en"))
        assertTrue(matchesNewSession("新会话", "zh"))
        assertTrue(!matchesNewSession("hello", "en"))
    }
    @Test fun exitMatch() {
        assertTrue(matchesExit("quit", "en"))
        assertTrue(matchesExit("退出", "zh"))
        assertTrue(!matchesExit("continue", "en"))
    }
    @Test fun wifiMatch() {
        assertTrue(matchesWifi("网络", "zh"))
        assertTrue(matchesWifi("wifi", "en"))
        assertTrue(!matchesWifi("hello", "en"))
    }
    @Test fun offlineHint() {
        assertEquals("tap: open WiFi · double-tap: exit", strings("en").offlineHint)
        assertEquals("单击:打开WiFi · 双击:退出", strings("zh").offlineHint)
    }
    @Test fun langSwitchedShownInTargetLang() {
        assertEquals("🌐 已切换为中文", strings("zh").langSwitched)
        assertEquals("🌐 Switched to English", strings("en").langSwitched)
    }
    @Test fun langSwitchMatchesBothLanguages() {
        assertTrue(matchesLangSwitch("切换语言"))
        assertTrue(matchesLangSwitch("切语言"))
        assertTrue(matchesLangSwitch("中英切换"))
        assertTrue(matchesLangSwitch("switch language"))
        assertTrue(matchesLangSwitch("change language"))
        assertTrue(matchesLangSwitch("toggle language"))
        assertTrue(matchesLangSwitch("Switch Language."))
    }
    @Test fun langSwitchDoesNotMatchTaskSentences() {
        assertTrue(!matchesLangSwitch("把这段代码的语言换成 Python"))
        assertTrue(!matchesLangSwitch("switch the language of this file to rust"))
        assertTrue(!matchesLangSwitch("hello"))
    }
    @Test fun scannerStrings() {
        assertEquals("对准 WiFi 二维码", strings("zh").scanHint)
        assertEquals("aim at the WiFi QR code", strings("en").scanHint)
        assertEquals("✅ 已保存网络", strings("zh").wifiSaved)
        assertEquals("⚠️ 未保存", strings("zh").wifiNotSaved)
        assertEquals("Camera not authorized", strings("en").cameraDenied)
    }
    @Test fun configStrings() {
        assertEquals("连接到", strings("zh").connectTo)
        assertEquals("Connect to", strings("en").connectTo)
        assertEquals("单击确认 · 双击取消", strings("zh").confirmHint)
        assertEquals("✅ 已配置,正在重连", strings("zh").configApplied)
        assertEquals("无法识别的二维码", strings("zh").unknownQr)
        assertEquals("unrecognized QR code", strings("en").unknownQr)
    }
}
