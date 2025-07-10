class Summary {
  /**
   * @param {import('../core/StepManager.js').default} stepManager
   * @param {import('./Memory.js').default} memory
   * @param {HTMLElement} container
   */
  constructor(stepManager, memory, container) {
    this.stepManager = stepManager;
    this.memory = memory;
    this.container = container;
  }

  /**
   * Generate a summary object grouped by step.
   * @returns {Array<{name:string, items:Array<{label:string, value:any, fieldName:string}>}>}
   */
  generate() {
    const groups = [];
    const values = this.memory.data.values || {};

    // Build map stepIndex -> items
    Object.keys(values).forEach(fieldName => {
      const entry = values[fieldName];
      if (!entry.isVisible) return; // only include visible fields
      const stepIndex = entry.stepIndex ?? -1;
      const stepObj = this.stepManager.steps[stepIndex];
      const stepName = stepObj ? (stepObj.element.querySelector('h2,h3')?.textContent?.trim() || `Step ${stepIndex + 1}`) : `Step ${stepIndex + 1}`;

      // Find group or create
      let group = groups.find(g => g.index === stepIndex);
      if (!group) {
        group = { index: stepIndex, name: stepName, items: [] };
        groups.push(group);
      }

      const label = this._getFieldLabel(fieldName);
      group.items.push({ label, value: entry.value, fieldName });
    });

    // sort by step index
    groups.sort((a, b) => a.index - b.index);
    return groups;
  }

  /**
   * Render the summary into the container.
   * @param {HTMLElement} [container]
   */
  render(container = this.container) {
    if (!container) return;
    const summary = this.generate();
    container.innerHTML = '';

    summary.forEach(group => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'summary-group';

      const heading = document.createElement('h3');
      heading.textContent = group.name;
      groupDiv.appendChild(heading);

      group.items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'summary-item';
        itemDiv.dataset.fieldName = item.fieldName;
        itemDiv.dataset.stepIndex = group.index;
        itemDiv.style.cursor = 'pointer';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'label';
        labelSpan.textContent = item.label;

        const valueSpan = document.createElement('span');
        valueSpan.className = 'value';
        if (Array.isArray(item.value)) {
          valueSpan.textContent = item.value.join(', ');
        } else {
          valueSpan.textContent = item.value;
        }

        const editIcon = document.createElement('span');
        editIcon.className = 'edit-icon';
        editIcon.textContent = '✏️';

        itemDiv.appendChild(labelSpan);
        itemDiv.appendChild(valueSpan);
        itemDiv.appendChild(editIcon);
        groupDiv.appendChild(itemDiv);
      });

      container.appendChild(groupDiv);
    });

    // attach edit handlers
    this.attachEditHandlers();
  }

  /** Add click listeners to summary items */
  attachEditHandlers() {
    const items = this.container.querySelectorAll('.summary-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const fieldName = item.dataset.fieldName;
        const stepIndex = parseInt(item.dataset.stepIndex, 10);
        this.initiateFieldEdit(fieldName, stepIndex);
      });
    });
  }

  /** Dispatch event so FormManager can navigate/focus */
  initiateFieldEdit(fieldName, stepIndex) {
    this.editContext = { fieldName, stepIndex };
    const evt = new CustomEvent('editField', { detail: { fieldName } });
    this.stepManager.root.dispatchEvent(evt);
  }

  /**
   * Find step index and wrapper answer for a given field.
   * @param {string} fieldName
   * @returns {{stepIndex:number, wrapperAnswer:string|null}|null}
   */
  getFieldLocation(fieldName) {
    const fieldEl = this.stepManager.root.querySelector(`[name="${fieldName}"]`);
    if (!fieldEl) return null;
    const stepEl = fieldEl.closest('[data-form="step"]');
    if (!stepEl) return null;
    const stepObj = this.stepManager.steps.find(s => s.element === stepEl);
    const stepIndex = stepObj ? stepObj.index : -1;
    const wrapperEl = fieldEl.closest('[data-answer]');
    const wrapperAnswer = wrapperEl ? wrapperEl.getAttribute('data-answer') : null;
    return { stepIndex, wrapperAnswer };
  }

  /** Regenerate and re-render */
  update() {
    this.render();
  }

  _getFieldLabel(fieldName) {
    // Try to find label element with for attribute
    const fieldEl = this.stepManager.root.querySelector(`[name="${fieldName}"]`);
    if (fieldEl) {
      // Check placeholder
      if (fieldEl.placeholder) return fieldEl.placeholder;
      // Check closest label wrapper
      const labelEl = fieldEl.closest('label');
      if (labelEl) {
        // Remove input's text
        const cloned = labelEl.cloneNode(true);
        cloned.querySelectorAll('input,select,textarea').forEach(n => n.remove());
        const text = cloned.textContent?.trim();
        if (text) return text;
      }
      // Check label[for]
      if (fieldEl.id) {
        const explicit = this.stepManager.root.querySelector(`label[for="${fieldEl.id}"]`);
        if (explicit) return explicit.textContent?.trim();
      }
    }
    // fallback
    return fieldName;
  }
}

export default Summary; 