-- Themes are now full shadcn/ui token sets ({ tokens, radius }), not a 7-color palette.
ALTER TABLE themes RENAME COLUMN colors TO variant;
