const TYPEFORM_API_URL = "https://api.typeform.com/forms";

export async function fetchTypeformResponses() {
  try {
    const url = new URL(
      `${TYPEFORM_API_URL}/${process.env.TYPEFORM_FORM_ID}/responses`
    );

    const params: Record<string, string> = {
      page_size: "100",
      sort: "submitted_at,asc",
    };

    url.search = new URLSearchParams(params).toString();

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${process.env.TYPEFORM_PERSONAL_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Error fetching Typeform responses: ${response.statusText}`
      );
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error("Failed to fetch Typeform responses:", error);
    return [];
  }
}
