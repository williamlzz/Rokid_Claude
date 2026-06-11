package com.rokid.relayhud

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** 解析机内配置码 `RCLAUDE:url=..;token=..;lang=..`。非该前缀或缺 url → null。 */
fun parseConfigQr(text: String): AppConfig? {
    val t = text.trim()
    if (!t.regionMatches(0, "RCLAUDE:", 0, 8, ignoreCase = true)) return null
    var url: String? = null
    var token = ""
    var lang = "zh"
    for (f in t.substring(8).split(';')) {
        if (f.isEmpty()) continue
        val i = f.indexOf('=')
        if (i < 0) continue
        val v = f.substring(i + 1)
        when (f.substring(0, i).trim().lowercase()) {
            "url" -> url = v
            "token" -> token = v
            "lang" -> lang = if (v == "en") "en" else "zh"
        }
    }
    if (url.isNullOrBlank()) return null
    return AppConfig(url, token, lang)
}

/** 序列化回 config.json 内容(与 parseConfig 往返一致,值正确转义)。 */
fun configToJson(cfg: AppConfig): String = JsonObject(
    mapOf(
        "serverUrl" to JsonPrimitive(cfg.serverUrl),
        "token" to JsonPrimitive(cfg.token),
        "lang" to JsonPrimitive(cfg.lang),
    ),
).toString()
