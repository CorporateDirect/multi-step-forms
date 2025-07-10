import FormManager from './core/FormManager.js';

console.log('Multi-step form script loaded');

if (typeof document !== 'undefined') {
  const init = () => {
    const forms = document.querySelectorAll('[data-form="multistep"]');
    forms.forEach(form => {
      const manager = new FormManager(form);
      manager.init();

      console.log('FormManager initialized:', manager);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
} 