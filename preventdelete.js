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
      if (node.nodeName.toLowerCase() === 'body') return false;
      if (self.checkNode(node)) return true;
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
      if (!currentElem) return;
      let nextSibling = currentElem.nextSibling;
      while (!nextSibling) {
        currentElem = currentElem.parentElement;
        if (!currentElem || currentElem?.id === self.rootId) return false;
        nextSibling = currentElem.nextSibling;
      }
      return nextSibling;
    };

    // Function to find the previous editable element
    this.prevElement = (elem) => {
      let currentElem = elem;
      let prevSibling = currentElem.previousSibling;
      while (!prevSibling) {
        currentElem = currentElem.parentElement;
        if (currentElem.id === self.rootId) return false;
        prevSibling = currentElem.previousSibling;
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
      const isBackspace = evt?.keyCode === 8;
      const isDelete = evt?.keyCode === 46;

      if (evt.shiftKey || evt.ctrlKey || isBackspace || isDelete) {
        const selection = tinymce?.activeEditor?.selection;
        const selectedNode = selection?.getNode?.();
        const range = selection?.getRng?.();
        if (!range) return;

        const startContainer = range.startContainer;
        const prevSibling = self.prevElement(startContainer);
        const nextSibling = self.nextElement(startContainer);

        const isEmptyStartContainer =
          !range.startContainer.textContent ||
          !range.startContainer.textContent.trim();

        const conditionHasNonEditable = {
          hasNonEditableNode_selectedNode:
            self.hasNonEditableNode(selectedNode),
          hasNonEditableNode_startContainer: self.hasNonEditableNode(
            range.startContainer
          ),
          hasNonEditableInChildren_startContainer:
            self.hasNonEditableInChildren(range.startContainer),
          isBackspaceWithNonEditablePrevSibling:
            isEmptyStartContainer &&
            isBackspace &&
            (self.hasNonEditableNode(prevSibling) ||
              self.hasNonEditableInChildren(prevSibling)),
          isDeleteWithNonEditableNextSibling:
            isEmptyStartContainer &&
            isDelete &&
            self.hasNonEditableNode(nextSibling),
        };

        const hasNonEditable = Object.values(conditionHasNonEditable).some(
          (condition) => condition
        );

        const noSelected = self.isNoSelected(range);

        // Handle delete empty line, press ctrl+delete, shift+delete, ctrl+backspace, shift+delete
        if (noSelected) {
          if (
            (evt.ctrlKey || evt.shiftKey) &&
            isBackspace &&
            range.startOffset === 0 &&
            (self.hasNonEditableNode(prevSibling) ||
              self.hasNonEditableInChildren(prevSibling))
          ) {
            return self.cancelKey(evt);
          }

          if (
            isDelete &&
            (evt.ctrlKey || evt.shiftKey) &&
            (self.hasNonEditableNode(nextSibling) ||
              self.hasNonEditableInChildren(nextSibling))
          ) {
            return self.cancelKey(evt);
          }
        }

        // Handle Shift+Insert, Shift+Delete, Shift+Backspace in range
        if (
          evt.shiftKey &&
          (['Insert', 'Delete', 'Backspace'].includes(evt.key) ||
            [45, 8, 46].includes(keyCode)) &&
          hasNonEditable
        )
          return self.cancelKey(evt);

        // Handle Ctrl+v, Ctrl+x, Ctrl+Delete, Ctrl+Backspace in range
        if (
          evt.ctrlKey &&
          (['v', 'x', 'Delete', 'Backspace'].includes(evt.key) ||
            [86, 88, 8, 46].includes(keyCode)) &&
          !noSelected &&
          hasNonEditable
        ) {
          return self.cancelKey(evt);
        }

        // Handle delete when next is mceNonEditable
        if (isDelete) {
          const nextSibling = self.nextElement(range.endContainer);
          if (
            !range.startContainer.textContent.trim() &&
            (!nextSibling || self.hasNonEditableNode(nextSibling))
          ) {
            return self.cancelKey(evt);
          }
        }

        // Handle backspace when prev is mceNonEditable
        if (isBackspace && hasNonEditable) {
          return self.cancelKey(evt);
        }
      }

      if (
        isWithinRange(keyCode, 48, 57) ||
        isWithinRange(keyCode, 65, 90) ||
        isWithinRange(keyCode, 96, 111) ||
        isWithinRange(keyCode, 186, 192) ||
        isWithinRange(keyCode, 219, 222)
      )
        return false;
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

    this.isNoSelected = (range) => {
      return (
        range.startOffset === range.endOffset ||
        range?.startContainer.textContent === ''
      );
    };

    this.handleEvent = (evt) => {
      const range = tinymce?.activeEditor?.selection?.getRng?.();
      if (!range) return;

      if (
        range.endContainer &&
        range.endOffset === 0 &&
        self.hasNonEditableNode(range.endContainer)
      ) {
        return self.cancelKey(evt);
      }

      if (self.checkRange(range)) return self.cancelKey(evt);
      if (self.keyWillDelete(evt)) return self.cancelKey(evt);
    };

    // Plugin logic to intercept keydown events and prevent deletion
    tinymce.PluginManager.add('preventdelete', (editor) => {
      editor.on('keydown', (evt) => self.handleEvent(evt));
      editor.on('BeforeExecCommand', (evt) => {
        //? Handle when focus to notediable -> select nextSibling can editable
        if (evt.command === 'mceFocus') {
          const selection = evt.target?.selection;
          const range = selection?.getRng?.();
          const noSelected = self.isNoSelected(range);
          const end = selection?.getEnd();

          // If not range and selected notediable
          if (noSelected && self.hasNonEditableNode(end)) {
            let selector = end;
            while (
              selector?.nextSibling &&
              !(
                self.hasNonEditableNode(selector?.nextSibling) ||
                self.hasNonEditableInChildren(selector?.nextSibling)
              )
            ) {
              selector = selector?.nextSibling;
            }
            return selection.setCursorLocation(selector, 0);
          }
        }

        if (
          ['Cut', 'Delete', 'Paste', 'mceInsertContent'].includes(evt.command)
        ) {
          return self.handleEvent(evt);
        }
        return true;
      });
      editor.on('BeforeSetContent', (evt) => self.handleEvent(evt));
      editor.on('click', () => {
        const selection = tinymce?.activeEditor?.selection;
        let selectedNode = selection?.getNode?.();

        if (!selectedNode) return;

        const checkBeforeNonEdiable = (selector) =>
          selector.matches(
            '[data-mce-caret="before"], [data-mce-bogus="all"]'
          ) && self.hasNonEditableNode(selector.nextSibling);

        let isBeforeNonEdiable = checkBeforeNonEdiable(selectedNode);

        // Check when click child of before NonEdiable
        if (
          !isBeforeNonEdiable &&
          checkBeforeNonEdiable(selectedNode.parentElement)
        ) {
          isBeforeNonEdiable = true;
          selectedNode = selectedNode.parentElement;
        }

        if (isBeforeNonEdiable) {
          let nextElement = selectedNode.nextSibling;
          while (self.hasNonEditableNode(nextElement)) {
            nextElement = nextElement.nextSibling;
          }

          return selection.setCursorLocation(nextElement, 0);
        }
      });
    });
  }

  new PreventDelete();
})();
