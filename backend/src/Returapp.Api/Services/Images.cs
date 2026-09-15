using SkiaSharp;

namespace Returapp.Api.Services;

public record ProcessedImage(byte[] Original, int W, int H, byte[] Thumb, int ThumbW, int ThumbH);

/// Bildebehandling i minnet med SkiaSharp (MIT): roter etter EXIF, skaler ned, JPEG uten metadata (GPS fjernes ved re-koding).
public static class Images
{
    public static ProcessedImage? Process(byte[] input, int maxSide = 2048, int thumbSide = 400)
    {
        using var data = SKData.CreateCopy(input);
        using var codec = SKCodec.Create(data);
        if (codec == null) return null;
        using var decoded = SKBitmap.Decode(codec);
        if (decoded == null) return null;
        using var oriented = Orient(decoded, codec.EncodedOrigin);
        using var big = Fit(oriented, maxSide);
        using var small = Fit(big, thumbSide);
        return new ProcessedImage(Jpeg(big, 85), big.Width, big.Height, Jpeg(small, 80), small.Width, small.Height);
    }

    public static byte[] Jpeg(SKBitmap bitmap, int quality)
    {
        using var image = SKImage.FromBitmap(bitmap);
        using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, quality);
        return encoded.ToArray();
    }

    static SKBitmap Fit(SKBitmap src, int max)
    {
        var scale = Math.Min(1.0, (double)max / Math.Max(src.Width, src.Height));
        var info = new SKImageInfo(Math.Max(1, (int)Math.Round(src.Width * scale)), Math.Max(1, (int)Math.Round(src.Height * scale)));
        return scale >= 1 ? src.Copy() : src.Resize(info, new SKSamplingOptions(SKCubicResampler.Mitchell));
    }

    static SKBitmap Orient(SKBitmap src, SKEncodedOrigin origin)
    {
        var (w, h, degrees, dx, dy) = origin switch
        {
            SKEncodedOrigin.BottomRight => (src.Width, src.Height, 180f, src.Width, src.Height),
            SKEncodedOrigin.RightTop => (src.Height, src.Width, 90f, src.Height, 0),
            SKEncodedOrigin.LeftBottom => (src.Height, src.Width, 270f, 0, src.Width),
            _ => (src.Width, src.Height, 0f, 0, 0),
        };
        var result = new SKBitmap(w, h);
        using var canvas = new SKCanvas(result);
        canvas.Translate(dx, dy);
        canvas.RotateDegrees(degrees);
        canvas.DrawBitmap(src, 0, 0, new SKSamplingOptions(SKFilterMode.Linear));
        return result;
    }

    /// Enkelt generert demo-/testbilde: dempet toning med en lysere flate.
    public static byte[] Demo(int seed, int w = 1200, int h = 900)
    {
        var rnd = new Random(seed);
        SKColor[] palette = [new(143, 168, 154), new(163, 184, 200), new(201, 183, 156), new(183, 196, 185), new(176, 160, 146)];
        var color = palette[rnd.Next(palette.Length)];
        using var bitmap = new SKBitmap(w, h);
        using var canvas = new SKCanvas(bitmap);
        using var paint = new SKPaint { Shader = SKShader.CreateLinearGradient(new SKPoint(0, 0), new SKPoint(0, h), [color, Darker(color)], SKShaderTileMode.Clamp) };
        canvas.DrawRect(0, 0, w, h, paint);
        using var light = new SKPaint { Color = new SKColor(255, 255, 255, 50) };
        canvas.DrawRect(rnd.Next(w / 12, w / 2), rnd.Next(h / 12, h / 2), rnd.Next(w / 4, w / 2), rnd.Next(h / 4, h / 2), light);
        return Jpeg(bitmap, 85);
    }

    static SKColor Darker(SKColor c) => new((byte)(c.Red * 0.6), (byte)(c.Green * 0.6), (byte)(c.Blue * 0.6));
}
