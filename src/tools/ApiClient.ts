export type ApiClientRequest = {
    url: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: unknown;
};

export type ApiClientResponse<T = unknown> = {
    status: number;
    data: T;
    headers: Record<string, string>;
};

export async function apiClient<T = unknown>(request: ApiClientRequest): Promise<ApiClientResponse<T>> {
    const response = await fetch(request.url, {
        method: request.method ?? "GET",
        headers: {
            "Content-Type": "application/json",
            ...(request.headers ?? {}),
        },
        body: request.body ? JSON.stringify(request.body) : undefined,
    });

    const data = await response.json().catch(() => null);
    const headers: Record<string, string> = {};

    response.headers.forEach((value, key) => {
        headers[key] = value;
    });

    return {
        status: response.status,
        data,
        headers,
    };
}
