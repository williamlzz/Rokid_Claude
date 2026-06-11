package com.rokid.relayhud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WifiQrTest {
    @Test fun standardWpa() {
        val q = parseWifiQr("WIFI:S:MyNet;T:WPA;P:pass123;;")!!
        assertEquals("MyNet", q.ssid)
        assertEquals("WPA", q.type)
        assertEquals("pass123", q.password)
        assertTrue(!q.hidden)
    }
    @Test fun openNetwork() {
        val q = parseWifiQr("WIFI:S:Cafe;T:nopass;;")!!
        assertEquals("Cafe", q.ssid)
        assertEquals("nopass", q.type)
        assertEquals("", q.password)
    }
    @Test fun missingTypeWithPasswordDefaultsWpa() {
        val q = parseWifiQr("WIFI:S:Net;P:pw;;")!!
        assertEquals("WPA", q.type)
    }
    @Test fun missingTypeNoPasswordDefaultsNopass() {
        val q = parseWifiQr("WIFI:S:Net;;")!!
        assertEquals("nopass", q.type)
    }
    @Test fun hiddenFlag() {
        assertTrue(parseWifiQr("WIFI:S:Net;T:WPA;P:pw;H:true;;")!!.hidden)
    }
    @Test fun escapes() {
        val q = parseWifiQr("WIFI:S:My\\;Net;T:WPA;P:a\\:b\\\\c;;")!!
        assertEquals("My;Net", q.ssid)
        assertEquals("a:b\\c", q.password)
    }
    @Test fun fieldOrderArbitrary() {
        val q = parseWifiQr("WIFI:T:WPA;P:pw;S:Net;;")!!
        assertEquals("Net", q.ssid)
        assertEquals("pw", q.password)
    }
    @Test fun trailingSingleSemicolon() {
        val q = parseWifiQr("WIFI:S:Net;T:WPA;P:pw;")!!
        assertEquals("Net", q.ssid)
    }
    @Test fun nonWifiReturnsNull() {
        assertNull(parseWifiQr("http://example.com"))
        assertNull(parseWifiQr(""))
        assertNull(parseWifiQr("WIFI:T:WPA;;"))
    }
    @Test fun caseInsensitivePrefix() {
        assertEquals("X", parseWifiQr("wifi:S:X;T:nopass;;")!!.ssid)
    }
}
