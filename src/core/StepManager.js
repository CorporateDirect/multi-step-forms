class StepManager {
  /**
   * @param {HTMLElement|Document} root - The root element to search within (defaults to document)
   */
  constructor(root = document) {
    this.root = root;
    /** @type {Array<{element: HTMLElement, index: number, wrappers: Array<{element: HTMLElement, answer: string | null, type: string}>}>} */
    this.steps = [];

    /**
     * Stores the answer value selected on previous step (set by ConditionalLogic).
     * Empty string means default wrapper.
     * @type {string}
     */
    this.selectedAnswer = '';
  }

  /**
   * Discovers all steps (elements with data-form="step") and their wrapper/answer elements.
   * Handles both simple (.step_wrapper with data-answer) and complex (.step_item with data-answer) structures.
   * @returns {Array} Array of step descriptor objects.
   */
  discoverSteps() {
    const stepElements = this.root.querySelectorAll('[data-form="step"]');
    this.steps = Array.from(stepElements).map((stepEl, index) => {
      // Find all elements with data-answer at any level within the step
      const wrapperEls = stepEl.querySelectorAll('[data-answer]');
      const wrappers = Array.from(wrapperEls).map(wrapperEl => {
        // Determine element type for better handling
        const isStepItem = wrapperEl.classList.contains('step_item');
        const isStepWrapper = wrapperEl.classList.contains('step_wrapper');
        
        return {
          element: wrapperEl,
          answer: wrapperEl.getAttribute('data-answer'),
          type: isStepItem ? 'step_item' : (isStepWrapper ? 'step_wrapper' : 'other')
        };
      });
      
      return {
        element: stepEl,
        index,
        wrappers
      };
    });
    return this.steps;
  }

  /**
   * Hides all discovered steps using display: none; If no steps discovered yet, it discovers first.
   */
  hideAllSteps() {
    if (!this.steps.length) {
      this.discoverSteps();
    }
    this.steps.forEach(step => {
      step.element.style.display = 'none';
    });
  }

  /**
   * Shows only the step at the given index (0-based) and hides all others.
   * @param {number} index - Index of the step to show.
   */
  showStep(index) {
    if (!this.steps.length) {
      this.discoverSteps();
    }
    this.steps.forEach(step => {
      step.element.style.display = step.index === index ? 'flex' : 'none';
    });

    // Handle conditional wrappers
    const stepObj = this.steps[index];
    if (stepObj) {
      const answerVal = index === 0 ? '' : this.selectedAnswer || '';
      this.showWrapper(stepObj, answerVal);
    }
  }

  /**
   * Shows only the wrapper inside given step that matches answerValue.
   * Handles both simple (.step_wrapper) and complex (.step_item) structures.
   * If not found, shows the first wrapper.
   * @param {{wrappers: Array<{element: HTMLElement, answer: string|null, type: string}>}} stepObj
   * @param {string} answerValue
   */
  showWrapper(stepObj, answerValue = '') {
    if (!stepObj || !stepObj.wrappers) return;

    let shown = false;
    let targetWrapper = null;

    // First pass: find the matching wrapper and hide all others
    stepObj.wrappers.forEach(wrapper => {
      const match = (wrapper.answer || '') === answerValue;
      
      if (match) {
        targetWrapper = wrapper;
        wrapper.element.style.display = 'flex';
        shown = true;
      } else {
        wrapper.element.style.display = 'none';
      }
    });

    // Handle nested structure: ensure parent .step_wrapper is visible when showing .step_item
    if (shown && targetWrapper && targetWrapper.type === 'step_item') {
      const parentWrapper = targetWrapper.element.closest('.step_wrapper');
      if (parentWrapper) {
        parentWrapper.style.display = 'flex';
      }
      
      // Hide sibling .step_item elements within the same parent
      const parentElement = targetWrapper.element.parentElement;
      if (parentElement) {
        const siblingStepItems = parentElement.querySelectorAll('.step_item');
        siblingStepItems.forEach(sibling => {
          if (sibling !== targetWrapper.element) {
            sibling.style.display = 'none';
          }
        });
      }
    }

    // Fallback: if no wrapper matched, show the first one
    if (!shown && stepObj.wrappers.length) {
      const firstWrapper = stepObj.wrappers[0];
      firstWrapper.element.style.display = 'flex';
      
      // If first wrapper is a step_item, ensure its parent is visible
      if (firstWrapper.type === 'step_item') {
        const parentWrapper = firstWrapper.element.closest('.step_wrapper');
        if (parentWrapper) {
          parentWrapper.style.display = 'flex';
        }
      }
    }
  }
}

export default StepManager; 