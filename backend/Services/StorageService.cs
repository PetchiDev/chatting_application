using System.Net.Http.Headers;

namespace ChatApi.Services;

public class StorageService
{
    private readonly HttpClient _http;
    private readonly string _supabaseUrl;
    private readonly string _serviceKey;
    private readonly string _bucket;

    public StorageService(IConfiguration config, IHttpClientFactory httpFactory)
    {
        _http = httpFactory.CreateClient("Supabase");
        _supabaseUrl = config["Supabase:Url"] ?? throw new InvalidOperationException("Supabase URL not configured");
        _serviceKey = config["Supabase:ServiceRoleKey"] ?? throw new InvalidOperationException("Supabase service key not configured");
        _bucket = config["Supabase:StorageBucket"] ?? "chat-attachments";
    }

    public async Task<string> UploadAsync(IFormFile file, Guid userId)
    {
        var ext = Path.GetExtension(file.FileName);
        var fileName = $"{userId}/{Guid.NewGuid()}{ext}";
        var url = $"{_supabaseUrl}/storage/v1/object/{_bucket}/{fileName}";

        using var content = new StreamContent(file.OpenReadStream());
        content.Headers.ContentType = new MediaTypeHeaderValue(file.ContentType);

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceKey);
        request.Content = content;

        var response = await _http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException($"Upload failed: {body}");
        }

        return $"{_supabaseUrl}/storage/v1/object/public/{_bucket}/{fileName}";
    }

    public async Task DeleteByUrlAsync(string publicUrl)
    {
        var prefix = $"/storage/v1/object/public/{_bucket}/";
        var idx = publicUrl.IndexOf(prefix, StringComparison.Ordinal);
        if (idx < 0) return;

        var path = publicUrl[(idx + prefix.Length)..];
        var url = $"{_supabaseUrl}/storage/v1/object/{_bucket}/{path}";

        using var request = new HttpRequestMessage(HttpMethod.Delete, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceKey);
        await _http.SendAsync(request);
    }
}
