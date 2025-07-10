class Validation {
  /**
   * @param {HTMLFormElement} formElement
   */
  constructor(formElement) {
    this.form = formElement;
  }

  /**
   * Validate all required fields inside a step element.
   * @param {HTMLElement} stepElement
   * @returns {boolean} true if valid
   */
  validateStep(stepElement) {
    if (!stepElement) return true;
    this.clearErrors(stepElement);

    let valid = true;
    const requiredFields = stepElement.querySelectorAll('[required]');

    requiredFields.forEach(field => {
      if (!this.validateField(field)) {
        valid = false;
      }
    });
    return valid;
  }

  /**
   * Validate a single field.
   * @param {HTMLElement} fieldEl Input/select/textarea element
   * @returns {boolean}
   */
  validateField(fieldEl) {
    if (!(fieldEl instanceof HTMLInputElement || fieldEl instanceof HTMLSelectElement || fieldEl instanceof HTMLTextAreaElement)) return true;

    const type = fieldEl.type;
    const name = fieldEl.name;
    let isValid = true;

    if (type === 'radio') {
      // Radio group: at least one checked within this step
      const group = fieldEl.closest('[data-form="step"]').querySelectorAll(`input[type="radio"][name="${name}"]`);
      const checked = Array.from(group).some(r => r.checked);
      isValid = checked;
    } else if (type === 'checkbox') {
      const checked = fieldEl.checked;
      isValid = checked;
    } else {
      isValid = fieldEl.value.trim() !== '';
    }

    if (!isValid) {
      this.showError(fieldEl, 'This field is required');
    }
    return isValid;
  }

  /**
   * Show validation error message for a field.
   * @param {HTMLElement} fieldEl
   * @param {string} message
   */
  showError(fieldEl, message) {
    fieldEl.classList.add('field-error');
    // place message after field if not already
    let errorEl = fieldEl.parentElement.querySelector('.error-message');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'error-message';
      fieldEl.parentElement.appendChild(errorEl);
    }
    errorEl.textContent = message;
  }

  /**
   * Clear all error styles/messages inside a step
   * @param {HTMLElement} stepElement
   */
  clearErrors(stepElement) {
    if (!stepElement) return;
    stepElement.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
    stepElement.querySelectorAll('.error-message').forEach(el => el.remove());
  }
}

export default Validation; 