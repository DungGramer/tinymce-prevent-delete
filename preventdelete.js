(function () {
  // Helper function to check if an element is in an array
  Array.prototype.contains = function (elem) {
    return this.indexOf(elem) > -1;
  };

  function PreventDelete() {
    const self = this;

    // Range validation function
    const isWithinRange = (value, min, max) => value >= min && value <= max;

    // Function to check if a string has any non-whitespace character near the specified position
    const hasTextAround = (str, pos, left = true) => {
      for (
        let i = left ? pos - 1 : pos;
        left ? i > 0 : i < str.length;
        left ? i-- : i++
      ) {
        // 160 is &nbsp, 32 is ' '
        if ([160, 32].contains(str.charCodeAt(i))) continue; // Skip spaces
        return true; // Found non-whitespace character
      }
      return false;
    };

    // Function to check if there's a stop condition (space and text sequence) around the position
    const hasStopTextAround = (str, pos, left = true) => {
      let foundSpace = false;
      let foundText = false;
      for (
        let i = left ? pos - 1 : pos;
        left ? i > 0 : i < str.length;
        left ? i-- : i++
      ) {
        const isSpace = [160, 32].contains(str.charCodeAt(i));
        if (!foundSpace && isSpace) foundSpace = true;
        else if (!foundText && !isSpace) foundText = true;

        if (foundSpace && foundText) return true; // Space and text found
      }
      return false;
    };

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
        if (currentElem?.id === self.rootId) return false;
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
      const isBackspace = evt?.keyCode === 8;
      const isDelete = evt?.keyCode === 46;

      if (evt.shiftKey || evt.ctrlKey || isBackspace || isDelete) {
        const selectedNode = tinymce.activeEditor.selection.getNode();
        const range = tinymce.activeEditor.selection.getRng();

        const prevSibling = self.prevElement(range.startContainer);
        const nextSibling = self.nextElement(range.startContainer);
        const hasNonEditable =
          self.hasNonEditableNode(selectedNode) ||
          self.hasNonEditableNode(range.startContainer) ||
          self.hasNonEditableInChildren(range.startContainer) ||
          ((!range.startContainer.textContent ||
            !range.startContainer.textContent.trim()) &&
            self.hasNonEditableNode(prevSibling)) ||
          self.hasNonEditableInChildren(prevSibling) ||
          self.hasNonEditableNode(nextSibling);

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
          hasNonEditable
        )
          return self.cancelKey(evt);

        // Handle delete when next is mceNonEditable
        if (isDelete) {
          const nextSibling = self.nextElement(range.endContainer);
          if (!nextSibling || self.hasNonEditableNode(nextSibling)) {
            return self.cancelKey(evt);
          }
        }

        // Handle backspace when prev is mceNonEditable
        if (isBackspace && hasNonEditable) {
          return self.cancelKey(evt);
        }
      }

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
      // const selectedNode = tinymce.activeEditor.selection.getNode();
      // if (
      //   self.hasNonEditableNode(selectedNode) ||
      //   self.hasNonEditableInChildren(selectedNode)
      // ) {
      //   return self.cancelKey(evt);
      // }

      const range = tinymce.activeEditor.selection.getRng();
      const isBackspace = evt?.keyCode === 8;
      const isDelete = evt?.keyCode === 46;

      if (
        range.endContainer &&
        range.endOffset === 0 &&
        self.hasNonEditableNode(range.endContainer)
      ) {
        return self.cancelKey(evt);
      }

      if (self.checkRange(range)) return self.cancelKey(evt);

      const endContainerText = range.endContainer.textContent || '';
      const isZwnbsp =
        range.startContainer.textContent &&
        range.startContainer.textContent.charCodeAt(0) === 65279;

      const deleteWithinNode =
        isDelete &&
        range.endOffset < endContainerText.length &&
        !(isZwnbsp && endContainerText.length === 1);
      const backspaceWithinNode =
        isBackspace && range.startOffset > (isZwnbsp ? 1 : 0);
      const ctrlDanger =
        evt.ctrlKey &&
        (isBackspace || isDelete) &&
        !hasTextAround(
          range.startContainer.data,
          range.startOffset,
          isBackspace
        );

      // Allow the delete
      if ((deleteWithinNode || backspaceWithinNode) && !ctrlDanger) {
        return true;
      }

      const noselection = range.startOffset === range.endOffset;
      // If ctrl is a danger we need to skip this block and check the siblings which is done in the rest of this function
      if (!ctrlDanger) {
        if (
          isDelete &&
          noselection &&
          range.startOffset + 1 < range.endContainer.childElementCount
        ) {
          const elem = range.endContainer.childNodes[range.startOffset + 1];
          return self.check(elem) ? self.cancelKey(evt) : true;
        }

        //The range is within this container
        if (range.startOffset !== range.endOffset) {
          //If this container is non-editable, cancel the event, otherwise allow the event
          return self.checkRange(range) ? self.cancelKey(evt) : true;
        }
      }

      return !self.keyWillDelete(evt);
    };

    // Plugin logic to intercept keydown events and prevent deletion
    tinymce.PluginManager.add('preventdelete', (ed) => {
      ed.on('keydown', (evt) => self.handleEvent(evt));
      ed.on('BeforeExecCommand', (evt) => {
        if (
          ['Cut', 'Delete', 'Paste', 'mceInsertContent'].includes(evt.command)
        ) {
          self.handleEvent(evt);
        }
        return true;
      });
      ed.on('BeforeSetContent', (evt) => self.handleEvent(evt));
    });
  }

  new PreventDelete();
})();
