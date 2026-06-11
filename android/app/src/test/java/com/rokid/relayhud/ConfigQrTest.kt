package com.rokid.relayhud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ConfigQrTest {
    @Test fun fullCode() {
        val c = parseConfigQr("RCLAUDE:url=wss://x.ngrok-free.dev;token=abc123;lang=en")!!
        assertEquals("wss://x.ngrok-free.dev", c.serverUrl)
        assertEquals("abc123", c.token)
        assertEquals("en", c.lang)
    }
    @Test fun missingLangDefaultsZh() {
        assertEquals("zh", parseConfigQr("RCLAUDE:url=ws://y;token=t")!!.lang)
    }
    @Test fun missingTokenEmpty() {
        assertEquals("", parseConfigQr("RCLAUDE:url=ws://y")!!.token)
    }
    @Test fun fieldOrderArbitrary() {
        val c = parseConfigQr("RCLAUDE:lang=en;token=t;url=wss://z")!!
        assertEquals("wss://z", c.serverUrl)
        assertEquals("t", c.token)
        assertEquals("en", c.lang)
    }
    @Test fun caseInsensitivePrefix() {
        assertEquals("ws://y", parseConfigQr("rclaude:url=ws://y")!!.serverUrl)
    }
    @Test fun missingUrlNull() {
        assertNull(parseConfigQr("RCLAUDE:token=t;lang=en"))
    }
    @Test fun nonConfigNull() {
        assertNull(parseConfigQr("WIFI:S:x;;"))
        assertNull(parseConfigQr(""))
        assertNull(parseConfigQr("http://example.com"))
    }
    @Test fun jsonRoundTrip() {
        val cfg = AppConfig("wss://x", "tok\"en", "en")
        assertEquals(cfg, parseConfig(configToJson(cfg)))
    }
    @Test fun jsonRoundTripEmptyToken() {
        val cfg = AppConfig("ws://y", "", "zh")
        assertEquals(cfg, parseConfig(configToJson(cfg)))
    }
}
