(function () {
  // Helper function to check if an element is in an array
  Array.prototype.contains = function (elem) {
    return this.indexOf(elem) > -1;
  };

  function PreventDelete() {
    const self = this;

    // Range validation function
    const isWithinRange = (value, min, max) => value >= min && value <= max;

    // Prevent delete class and root ID
    this.rootId = 'tinymce';
    this.preventDeleteClass = 'mceNonEditable';

    // Function to check if a node or its children have the 'prevent delete' class
    this.hasNonEditableNode = (node) => {
      if (!node) return false;
      if (
        node.nodeType === 1 &&
        node.classList &&
        node.classList.contains(self.preventDeleteClass)
      ) {
        return true;
      }
      if (node.hasChildNodes()) {
        for (const child of node.childNodes) {
          if (self.hasNonEditableNode(child)) return true;
        }
      }
      return false;
    };

    // Function to check if a range intersects with any non-editable nodes
    this.checkRange = (range) => {
      if (!range) return false;
      let container = range.commonAncestorContainer;
      if (container.nodeType === 3) container = container.parentNode;

      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode(node) {
            const nodeRange = document.createRange();
            nodeRange.selectNode(node);
            if (range.intersectsNode(node)) return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_SKIP;
          },
        }
      );

      let node;
      while ((node = walker.nextNode())) {
        if (self.hasNonEditableNode(node)) return true;
      }

      const startNode =
        range.startContainer.nodeType === 1
          ? range.startContainer
          : range.startContainer.parentElement;
      const endNode =
        range.endContainer.nodeType === 1
          ? range.endContainer
          : range.endContainer.parentElement;

      return (
        self.hasNonEditableNode(startNode) || self.hasNonEditableNode(endNode)
      );
    };

    // Function to find the next editable element
    this.nextElement = (elem) => {
      let currentElem = elem;
      let nextSibling = currentElem.nextElementSibling;
      while (!nextSibling) {
        currentElem = currentElem.parentElement;
        if (currentElem.id === self.rootId) return false;
        nextSibling = currentElem.nextElementSibling;
      }
      return nextSibling;
    };

    // Function to find the previous editable element
    this.prevElement = (elem) => {
      let currentElem = elem;
      let prevSibling = currentElem.previousElementSibling;
      while (!prevSibling) {
        currentElem = currentElem.parentElement;
        if (currentElem.id === self.rootId) return false;
        prevSibling = currentElem.previousElementSibling;
      }
      return prevSibling;
    };

    // Key press validation to prevent certain deletions
    /*
    In trying to figure out how to detect if a key was relevant, I appended all the keycodes for keys on my keyboard that would "delete" selected text, and sorted.  Generated the range blow:
    Deleting
    8, 9, 13, 46, 48-57, 65-90, 96-111, 186-192, 219-222

    I did the same thign with keys that wouldn't and got these below
    Not harmful
    16-19, 27, 33-40, 45, 91-93, 112-123, 144

    You should note, since it's onkeydown it doesn't change the code if you have alt or ctrl or something pressed.  It makes it fewer keycombos actually.

    I'm pretty sure in these "deleting" keys will still "delete" if shift is held
    */
    this.keyWillDelete = (evt) => {
      const keyCode = evt.keyCode;
      // ctrl+x or ctrl+back/del will all delete, but otherwise it probably won't
      if (evt.ctrlKey) return evt.key === 'x' || [8, 46].contains(keyCode);
      return (
        [8, 9, 13, 46].contains(keyCode) ||
        isWithinRange(keyCode, 48, 57) ||
        isWithinRange(keyCode, 65, 90) ||
        isWithinRange(keyCode, 96, 111) ||
        isWithinRange(keyCode, 186, 192) ||
        isWithinRange(keyCode, 219, 222)
      );
    };

    // Cancel the key event (e.g., prevent default delete behavior)
    this.cancelKey = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    };

    // Function to check if a node has the 'prevent delete' class
    this.checkNode = (node) => {
      return (
        node &&
        node.nodeType === 1 &&
        node.nodeName.toLowerCase() !== 'body' &&
        node.classList &&
        node.classList.contains(self.preventDeleteClass)
      );
    };

    // Function to check if any parent of a node has the 'prevent delete' class
    this.checkParents = (node) => {
      if (
        !node ||
        node.nodeType !== 1 ||
        node.nodeName.toLowerCase() === 'body'
      )
        return false;
      return node.closest(`.${self.preventDeleteClass}`) !== null;
    };

    // Function to check if any child of a node has the 'prevent delete' class
    this.hasNonEditableInChildren = (node) => {
      if (
        !node ||
        node.nodeType !== 1 ||
        node.nodeName.toLowerCase() === 'body'
      )
        return false;
      return node.querySelector(`.${self.preventDeleteClass}`) !== null;
    };

    this.handleEvent = (evt) => {
      if (!self.keyWillDelete(evt)) return true;

      const selectedNode = tinymce.activeEditor.selection.getNode();
      const range = tinymce.activeEditor.selection.getRng();

      const prev = self.prevElement(range.startContainer);
      const next = self.nextElement(range.startContainer);
      const startContainer = range.startContainer;
      const startTextContent = startContainer?.textContent;
      const cleanedTextContent = startTextContent?.replace(/^\uFEFF/gm, '');
      const prevCheck =
        self.hasNonEditableNode(prev) || self.hasNonEditableInChildren(prev);
      const nextCheck = self.hasNonEditableNode(next);

      const isStartContainerValid =
        self.hasNonEditableNode(startContainer) ||
        self.hasNonEditableInChildren(startContainer);
      const isStartContentValid =
        startContainer && startTextContent && cleanedTextContent?.length;

      // Prevent deletion if the range contains non-editable content
      if (
        self.checkRange(range) ||
        self.hasNonEditableNode(selectedNode) ||
        self.hasNonEditableInChildren(selectedNode) ||
        (!isStartContainerValid &&
          !isStartContentValid &&
          (prevCheck || nextCheck))
      ) {
        return self.cancelKey(evt);
      }
    };

    // Plugin logic to intercept keydown events and prevent deletion
    tinymce.PluginManager.add('preventdelete', (ed) => {
      ed.on('keydown', (evt) => self.handleEvent(evt));
      ed.on('BeforeExecCommand', (evt) => {
        if (['Cut', 'Delete', 'Paste'].includes(evt.command)) {
          self.handleEvent(evt);
        }

        return true;
      });
      ed.on('BeforeSetContent', (evt) => self.handleEvent(evt));
    });
  }

  new PreventDelete();
})();
