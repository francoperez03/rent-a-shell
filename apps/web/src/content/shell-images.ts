/** Photo per shell id, served from public/shells. A shell without one shows the bench well with its name. */
export const SHELL_IMAGES: Record<string, string> = {
  'el-tucu': '/shells/el-tucu.jpg',
};

/** The site's copy first: the gateway's `image` dies with its tunnel when the shell goes offline. */
export const shellPhoto = (shell: { id: string; image?: string | null }) => SHELL_IMAGES[shell.id] ?? shell.image ?? undefined;
