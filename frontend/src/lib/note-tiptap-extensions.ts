import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";

/** 与存储格式 `![alt](mynotes:media:uuid)` 对应的图片节点，带 `mediaId` 以便导出 Markdown */
export const NoteMediaImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-media-id"),
        renderHTML: (attributes) => {
          if (!attributes.mediaId) return {};
          return { "data-media-id": attributes.mediaId, "data-note-img": "1" };
        },
      },
    };
  },
});

export function createNoteEditorExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          class: "text-primary underline underline-offset-2",
          rel: "noopener noreferrer",
          target: "_blank",
        },
      },
    }),
    NoteMediaImage.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: { class: "note-wysiwyg-img rounded-xl max-w-full h-auto my-2" },
    }),
    Placeholder.configure({
      placeholder,
      emptyEditorClass: "is-editor-empty",
    }),
  ];
}
