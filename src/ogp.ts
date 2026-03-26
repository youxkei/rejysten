export async function fetchOGPTitle(url: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/ogp?url=${encodeURIComponent(url)}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { title: string | null };
    return data.title;
  } catch {
    return null;
  }
}
