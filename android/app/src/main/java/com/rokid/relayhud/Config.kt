package com.rokid.relayhud

import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** 眼镜 app 的连接配置。token 为空=本地直连不鉴权;lang=zh|en 决定全 app 语言。 */
data class AppConfig(val serverUrl: String, val token: String, val lang: String = "zh")

val DEFAULT_CONFIG = AppConfig(serverUrl = "ws://localhost:8787", token = "", lang = "zh")

/** 解析 adb 推来的 config.json;为空/非法时回退本地默认。 */
fun parseConfig(json: String?): AppConfig {
    if (json.isNullOrBlank()) return DEFAULT_CONFIG
    return try {
        val o = Json.parseToJsonElement(json).jsonObject
        val url = o["serverUrl"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
            ?: DEFAULT_CONFIG.serverUrl
        val tok = o["token"]?.jsonPrimitive?.contentOrNull ?: ""
        val lang = if (o["lang"]?.jsonPrimitive?.contentOrNull == "en") "en" else "zh"
        AppConfig(url, tok, lang)
    } catch (_: Exception) {
        DEFAULT_CONFIG
    }
}

/** 把 token 作为查询串拼到 ws(s) 地址上;token 为空则原样返回。 */
fun buildWsUrl(host: String, token: String): String {
    if (token.isEmpty()) return host
    val enc = URLEncoder.encode(token, StandardCharsets.UTF_8.name())
    val fragment = host.substringAfter('#', missingDelimiterValue = "")
    val rawBase = host.substringBefore('#')
    val base = if (!rawBase.contains("?") && !rawBase.substringAfter("://", "").contains("/")) "$rawBase/" else rawBase
    val sep = when {
        base.endsWith("?") || base.endsWith("&") -> ""
        base.contains("?") -> "&"
        else -> "?"
    }
    val suffix = if (fragment.isEmpty()) "" else "#$fragment"
    return "$base${sep}token=$enc$suffix"
}
