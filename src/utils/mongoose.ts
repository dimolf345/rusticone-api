export function renameMongoId(
    _document: unknown,
    result: Record<string, unknown>
): Record<string, unknown> {
    result.id = String(result._id);
    delete result._id;
    return result;
}