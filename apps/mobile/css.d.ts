// Metro (via uniwind) consumes the Tailwind entry css at bundle time; for
// the type checker a css import is side-effect only.
declare module '*.css'
