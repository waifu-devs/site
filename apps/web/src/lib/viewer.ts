import { useLoaderData } from "@tanstack/react-router";

/** The signed-in user (or null) and the theme the site is dressed in, from the root loader. */
export const useViewer = () => useLoaderData({ from: "__root__" });
