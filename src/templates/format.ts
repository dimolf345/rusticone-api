/** Small formatting helpers shared by the email templates. */

const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
};

/** Escapes characters that are unsafe to interpolate into HTML markup. */
export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Formats a value as EUR currency (the catering business operates in euros). */
export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-IE", {
        style: "currency",
        currency: "EUR"
    }).format(amount);
}

/** Formats a date as a readable day/month/year string in UTC. */
export function formatDate(date: Date): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
    }).format(date);
}
