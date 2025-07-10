# Data Attributes Reference

| Attribute | Values | Element | Required | Description |
|-----------|--------|---------|----------|-------------|
| `data-form="multistep"` | `"multistep"` | `<form>` | Yes | Initializes the multi-step form system with conditional logic |
| `data-form="step"` | `"step"` | Container (e.g., `<div>`) | Yes | Defines a form step - each represents a single screen/view |
| `data-go-to` | Unique identifier<br>(e.g., `"option-a"`, `"business"`) | • Radio buttons<br>• Step containers | Yes* | **Radio buttons:** Defines which branch to show on next step<br>**Step containers:** Creates automatic navigation to specific branch |
| `data-answer` | • `""` (first step)<br>• Matching `data-go-to` value | Step containers | Yes | Marks element as conditional destination - only shows when matching `data-go-to` is triggered |
| `data-skip-to` | Step identifier<br>(e.g., `"step-5"`, `"checkout"`) | • Buttons/links<br>• Radio buttons<br>• Step containers | No | Enables non-linear navigation, skipping multiple steps |
| `data-form-no-input` | No value (presence only) | Steps without inputs | Conditional** | Bypasses validation for information-only steps (intro screens, etc.) |
| `data-form="summary"` | `"summary"` | Container (e.g., `<div>`) | No | Designates where the form summary will be rendered |
| `data-step-name` | Descriptive string<br>(e.g., `"Contact Info"`) | Step elements | No | Custom step name for summary headings instead of "Step 1", "Step 2" |
| `data-field-group` | Group name<br>(e.g., `"Personal Info"`) | Field containers | No | Groups related fields under common heading in summary |
| `data-label` | Descriptive string<br>(e.g., `"Email Address"`) | Input elements | No | Custom field label for summary display, overrides auto-detected labels |

## Notes

\* Required when using conditional logic or branching  
\*\* Required for steps that contain no form inputs