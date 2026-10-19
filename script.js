const $ = id => document.getElementById(id);
const codeInput = $("codeInput");

const sampleCode = `"""Example program for calculating student results."""

def calculate_average(marks):
    """Calculate the average of a list of marks."""
    if not marks:
        raise ValueError("Marks list cannot be empty")
    return sum(marks) / len(marks)


def get_grade(average):
    """Convert an average score into a letter grade."""
    if average >= 90:
        return "A"
    elif average >= 75:
        return "B"
    elif average >= 60:
        return "C"
    return "D"


def main():
    """Run the student marks example."""
    marks = [82, 91, 76, 88]
    average = calculate_average(marks)
    grade = get_grade(average)
    print(f"Average: {average:.1f}; grade: {grade}")


if __name__ == "__main__":
    main()
`;

let markdownOutput = "";

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
function showError(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}
function updateCounts() {
  const text = codeInput.value;
  $("lineCount").textContent = `${text ? text.split("\\n").length : 0} lines`;
  $("charCount").textContent = `${text.length} characters`;
}
function findFunctions(source) {
  const lines = source.split("\\n");
  const functions = [];
  const pattern = /^(\\s*)(?:async\\s+)?def\\s+([A-Za-z_]\\w*)\\s*\\((.*?)\\)\\s*(?:->\\s*([^:]+))?\\s*:/;
  lines.forEach((line, index) => {
    const match = line.match(pattern);
    if (!match) return;
    const indent = match[1].length;
    const parameters = match[3].trim()
      ? match[3].split(",").map(p => p.trim()).filter(Boolean) : [];
    const body = [];
    for (let j = index + 1; j < lines.length; j++) {
      if (lines[j].trim() && lines[j].match(/^\\s*/)[0].length <= indent) break;
      body.push(lines[j]);
    }
    const bodyText = body.join("\\n");
    const returns = [];
    body.forEach(row => {
      const m = row.trim().match(/^return(?:\\s+(.*))?$/);
      if (m) returns.push(m[1] || "None");
    });
    const exceptions = [...new Set([...bodyText.matchAll(/\\braise\\s+([A-Za-z_]\\w*)/g)].map(m => m[1]))];
    let docstring = "";
    for (const row of body) {
      const t = row.trim();
      if (!t || t.startsWith("#")) continue;
      const tripleDouble = String.fromCharCode(34).repeat(3);
      const tripleSingle = String.fromCharCode(39).repeat(3);
      if (t.startsWith(tripleDouble) || t.startsWith(tripleSingle)) {
        const marker = t.startsWith(tripleDouble) ? tripleDouble : tripleSingle;
        docstring = t.slice(marker.length).split(marker)[0].trim();
      }
      break;
    }
    functions.push({
      name: match[2], parameters, annotation: (match[4] || "").trim(),
      returns: [...new Set(returns)], exceptions, docstring, body: bodyText, line: index + 1
    });
  });
  return functions;
}
function describeFunction(fn) {
  if (fn.docstring) return fn.docstring;
  const hints = [];
  if (/\\bprint\\s*\\(/.test(fn.body)) hints.push("Writes output to the console");
  if (/\\binput\\s*\\(/.test(fn.body)) hints.push("Reads input from the user");
  if (/\\breturn\\b/.test(fn.body)) hints.push("Computes or selects a result and returns it");
  if (/\\braise\\b/.test(fn.body)) hints.push("Raises an exception when a condition is not met");
  if (/\\b(?:for|while)\\b/.test(fn.body)) hints.push("Processes items using a loop");
  if (/\\b(?:if|elif|else)\\b/.test(fn.body)) hints.push("Uses conditional logic");
  return hints.length ? hints.join(". ") + "." :
    `Function named ${fn.name}; inspect its body to confirm its exact purpose.`;
}
function makeDocstring(fn) {
  const args = fn.parameters.length
    ? `\\n\\nArgs:\\n${fn.parameters.map(p => `    ${p}: Describe this parameter.`).join("\\n")}` : "";
  const returns = fn.returns.length ? fn.returns.join(" or ") : "Describe the returned value, if any.";
  const raises = fn.exceptions.length
    ? `\\n\\nRaises:\\n${fn.exceptions.map(e => `    ${e}: Describe when this exception occurs.`).join("\\n")}` : "";
  return `"""${describeFunction(fn)}${args}\\n\\nReturns:\\n    ${returns}${raises}"""`;
}
function overviewFor(source, functions) {
  const imports = [...source.matchAll(/^\\s*(?:from\\s+[\\w.]+\\s+import\\s+.+|import\\s+.+)$/gm)].map(m => m[0].trim());
  const classes = [...source.matchAll(/^\\s*class\\s+([A-Za-z_]\\w*)/gm)].map(m => m[1]);
  const printCount = (source.match(/\\bprint\\s*\\(/g) || []).length;
  const inputCount = (source.match(/\\binput\\s*\\(/g) || []).length;
  const parts = [`This Python program contains ${functions.length} detected function(s) and ${classes.length} class(es).`];
  parts.push(imports.length ? `It imports: ${imports.join("; ")}.` : "No import statements were detected.");
  if (printCount) parts.push(`It includes ${printCount} print statement(s) for console output.`);
  if (inputCount) parts.push(`It includes ${inputCount} input call(s) for user interaction.`);
  if (/if\\s+__name__\\s*==\\s*["']__main__["']\\s*:/.test(source)) parts.push("It includes a standard main guard.");
  return parts.join(" ");
}
function buildMarkdown(source, functions, overview, exceptions) {
  const lines = ["# Python Code Documentation", "", "## 1. Program Overview", "", overview, "",
    "## 2. Source Summary", "", `- Source lines: ${source.split("\\n").length}`,
    `- Detected functions: ${functions.length}`,
    `- Import statements: ${(source.match(/^\\s*(?:from\\s+[\\w.]+\\s+import\\s+.+|import\\s+.+)$/gm) || []).length}`,
    `- Detected classes: ${(source.match(/^\\s*class\\s+[A-Za-z_]\\w*/gm) || []).length}`, "",
    "## 3. Function Documentation", ""];
  if (!functions.length) lines.push("No function definitions were detected by the basic pattern analyzer.", "");
  functions.forEach(fn => {
    lines.push(`### \\`${fn.name}(${fn.parameters.join(", ")})\\``, "",
      `- **Description:** ${describeFunction(fn)}`,
      `- **Parameters:** ${fn.parameters.join(", ") || "None detected"}`,
      `- **Return value:** ${fn.returns.join(" or ") || "No explicit return statement detected"}`,
      `- **Return annotation:** ${fn.annotation || "None specified"}`,
      `- **Possible exceptions:** ${fn.exceptions.join(", ") || "No explicit raise statement detected"}`,
      `- **Source location:** approximately line ${fn.line}`, "", "Suggested docstring:", "```python",
      makeDocstring(fn), "```", "");
  });
  lines.push("## 4. Possible Exceptions", "",
    exceptions.length ? [...new Set(exceptions)].map(e => `- \\`${e}\\` is explicitly raised in the source.`).join("\\n")
      : "- No explicit `raise` statement was detected. Runtime errors may still occur.", "",
    "## 5. Verification Notes", "",
    "- Function names and parameters were extracted from `def` statements.",
    "- Return expressions were taken from explicit `return` statements.",
    "- Explicitly raised exceptions were collected from `raise` statements.",
    "- Compare descriptions and suggested docstrings against the original source.",
    "- This is a rule-based prototype, not a Python interpreter or generative AI model.", "");
  return lines.join("\\n");
}
function renderOutput(source, functions, overview, exceptions) {
  const output = $("output");
  output.innerHTML = "";
  const overviewBox = document.createElement("div");
  overviewBox.className = "overview";
  overviewBox.innerHTML = `<h3>Program overview</h3><p>${escapeHTML(overview)}</p>`;
  output.appendChild(overviewBox);
  const summary = document.createElement("p");
  summary.textContent = `Analysis found ${functions.length} function(s), ${(source.match(/^\\s*class\\s+[A-Za-z_]\\w*/gm) || []).length} class(es), and ${exceptions.length} explicit exception type(s).`;
  output.appendChild(summary);
  const heading = document.createElement("h3");
  heading.textContent = "Function details";
  output.appendChild(heading);
  if (!functions.length) {
    const note = document.createElement("p");
    note.textContent = "No function definitions were detected. This prototype focuses on Python functions declared with def name(...):.";
    output.appendChild(note);
  }
  functions.forEach(fn => {
    const card = document.createElement("section");
    card.className = "function-card";
    const title = document.createElement("h4");
    title.textContent = `${fn.name}(${fn.parameters.join(", ")})`;
    card.appendChild(title);
    const body = document.createElement("div");
    body.className = "function-body";
    body.innerHTML = `<p>${escapeHTML(describeFunction(fn))}</p>
      <div class="detail"><b>Parameters</b><span>${escapeHTML(fn.parameters.join(", ") || "None detected")}</span></div>
      <div class="detail"><b>Return value</b><span>${escapeHTML(fn.returns.join(" or ") || "No explicit return statement detected")}</span></div>
      <div class="detail"><b>Annotation</b><span>${escapeHTML(fn.annotation || "None specified")}</span></div>
      <div class="detail"><b>Exceptions</b><span>${escapeHTML(fn.exceptions.join(", ") || "No explicit raise statement detected")}</span></div>
      <div class="detail"><b>Source line</b><span>${fn.line}</span></div>
      <h3>Suggested docstring</h3><div class="doc-comment">${escapeHTML(makeDocstring(fn))}</div>`;
    card.appendChild(body);
    output.appendChild(card);
  });
  const exceptionHeading = document.createElement("h3");
  exceptionHeading.textContent = "Possible exceptions";
  output.appendChild(exceptionHeading);
  const exceptionText = document.createElement("p");
  exceptionText.textContent = exceptions.length
    ? [...new Set(exceptions)].join(", ") + " — explicitly raised in the source. Other runtime exceptions may also be possible."
    : "No explicit raise statements were detected. This does not guarantee that runtime errors cannot occur.";
  output.appendChild(exceptionText);
  $("verification").textContent = `Source checks: ${functions.length} function(s), ${functions.reduce((n, f) => n + f.parameters.length, 0)} parameter(s), ${functions.reduce((n, f) => n + f.returns.length, 0)} return expression(s), and ${exceptions.length} explicit raise statement(s). These checks do not prove the program runs correctly.`;
  $("emptyState").hidden = true;
  output.hidden = false;
  $("resultTag").textContent = "Generated";
  $("functionCount").textContent = `${functions.length} function(s) found`;
  $("downloadBtn").disabled = false;
}
function generateDocumentation() {
  const source = codeInput.value.trim();
  showError("");
  if (!source) {
    showError("Please paste Python source code or click “Load sample code” first.");
    codeInput.focus();
    return;
  }
  if (!/^\\s*(?:async\\s+)?def\\s+[A-Za-z_]\\w*\\s*\\(/m.test(source) &&
      !/^\\s*(?:import\\s+|from\\s+\\S+\\s+import\\s+)/m.test(source) &&
      !/^\\s*(?:class\\s+[A-Za-z_]\\w*|if\\s+__name__\\s*==)/m.test(source)) {
    showError("This does not look like supported Python source. Try a Python function, class, import statement, or the sample code.");
    return;
  }
  if ((source.match(/\\(/g) || []).length !== (source.match(/\\)/g) || []).length ||
      (source.match(/\\[/g) || []).length !== (source.match(/\\]/g) || []).length) {
    showError("Some parentheses or square brackets appear unmatched. Check the code and try again.");
    return;
  }
  const functions = findFunctions(source);
  const exceptions = [...source.matchAll(/\\braise\\s+([A-Za-z_]\\w*)/g)].map(m => m[1]);
  const overview = overviewFor(source, functions);
  markdownOutput = buildMarkdown(source, functions, overview, exceptions);
  renderOutput(source, functions, overview, exceptions);
}
function downloadDocumentation() {
  if (!markdownOutput) {
    showError("Generate documentation before downloading it.");
    return;
  }
  const blob = new Blob([markdownOutput], {type:"text/markdown;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "python_code_documentation.md";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function clearAll() {
  codeInput.value = "";
  markdownOutput = "";
  $("output").innerHTML = "";
  $("output").hidden = true;
  $("emptyState").hidden = false;
  $("resultTag").textContent = "Waiting for code";
  $("functionCount").textContent = "0 functions found";
  $("downloadBtn").disabled = true;
  $("verification").textContent = "Generate documentation to see source checks performed for your code.";
  showError("");
  updateCounts();
}
$("sampleBtn").addEventListener("click", () => {
  codeInput.value = sampleCode;
  updateCounts();
  showError("");
});
$("generateBtn").addEventListener("click", generateDocumentation);
$("downloadBtn").addEventListener("click", downloadDocumentation);
$("clearBtn").addEventListener("click", clearAll);
codeInput.addEventListener("input", updateCounts);
updateCounts();
