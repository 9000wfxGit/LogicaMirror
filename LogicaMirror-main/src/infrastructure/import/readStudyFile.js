export function readStudyFile(file) {
  if (!file) {
    return Promise.reject(new Error("No file selected."));
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    return Promise.reject(
      new Error("PDF import is reserved for the next parser step. Use Markdown or text for this local prototype.")
    );
  }

  if (!["md", "markdown", "txt"].includes(extension || "")) {
    return Promise.reject(new Error("Use a Markdown or text file for this local prototype."));
  }

  return file.text().then((text) => ({
    title: file.name.replace(/\.[^.]+$/, ""),
    text
  }));
}
