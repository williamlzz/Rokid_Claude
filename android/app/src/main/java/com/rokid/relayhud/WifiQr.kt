package com.rokid.relayhud

/** 解析标准 WiFi 二维码 `WIFI:S:..;T:..;P:..;H:..;;`。type ∈ WPA/WEP/nopass。 */
data class WifiQr(val ssid: String, val type: String, val password: String, val hidden: Boolean)

/** 按未转义的分隔符切分(转义对 `\x` 整体保留,留给 unescape 处理)。 */
private fun splitUnescaped(s: String, delim: Char): List<String> {
    val out = ArrayList<String>()
    val cur = StringBuilder()
    var i = 0
    while (i < s.length) {
        val c = s[i]
        if (c == '\\' && i + 1 < s.length) { cur.append(c).append(s[i + 1]); i += 2; continue }
        if (c == delim) { out.add(cur.toString()); cur.setLength(0); i++; continue }
        cur.append(c); i++
    }
    out.add(cur.toString())
    return out
}

/** 去转义:`\x` → `x`。 */
private fun unescape(s: String): String {
    val out = StringBuilder()
    var i = 0
    while (i < s.length) {
        val c = s[i]
        if (c == '\\' && i + 1 < s.length) { out.append(s[i + 1]); i += 2; continue }
        out.append(c); i++
    }
    return out.toString()
}

/** 非 WiFi 串或缺 SSID → null。字段顺序任意,缺 T 时按有无密码推断。 */
fun parseWifiQr(text: String): WifiQr? {
    val t = text.trim()
    if (!t.regionMatches(0, "WIFI:", 0, 5, ignoreCase = true)) return null
    val fields = splitUnescaped(t.substring(5), ';')
    var ssid: String? = null
    var type: String? = null
    var pwd = ""
    var hidden = false
    for (f in fields) {
        if (f.isEmpty()) continue
        val idx = f.indexOf(':')
        if (idx < 0) continue
        val value = unescape(f.substring(idx + 1))
        when (f.substring(0, idx).uppercase()) {
            "S" -> ssid = value
            "T" -> type = value
            "P" -> pwd = value
            "H" -> hidden = value.equals("true", ignoreCase = true)
        }
    }
    if (ssid.isNullOrEmpty()) return null
    val resolvedType = when {
        !type.isNullOrEmpty() -> type
        pwd.isEmpty() -> "nopass"
        else -> "WPA"
    }
    return WifiQr(ssid, resolvedType, pwd, hidden)
}
