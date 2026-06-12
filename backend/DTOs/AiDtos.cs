using System.Text.Json;

namespace ChatApi.DTOs;

public record AiChatMessage(string Role, string Content);

public record AiChatRequest(List<AiChatMessage> Messages);

public record AiClientAction(string Type, JsonElement? Payload);

public record AiChatResponse(
    string Reply,
    List<AiClientAction> Actions,
    JsonElement? A2ui
);
