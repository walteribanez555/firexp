package com.example.fire_hack.ui.component

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

@Composable
fun QrCodeView(url: String, size: Dp, modifier: Modifier = Modifier) {
    val bitmap = remember(url) { generateQrBitmap(url, sizePx = 512) }
    Image(
        bitmap = bitmap.asImageBitmap(),
        contentDescription = "QR Code",
        modifier = modifier.size(size)
    )
}

private fun generateQrBitmap(content: String, sizePx: Int): Bitmap {
    val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx)
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565)
    for (x in 0 until sizePx) {
        for (y in 0 until sizePx) {
            bitmap.setPixel(x, y, if (matrix[x, y]) Color.Black.toArgb() else Color.White.toArgb())
        }
    }
    return bitmap
}
