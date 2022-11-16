(function ($) {
  var $ = jQuery = $;

  var cc = {
    sections: [] };


  // requires: throttled-scroll, debouncedresize
  theme.Sections = new function () {
    var _ = this;

    _._instances = [];
    _._deferredSectionTargets = [];
    _._sections = [];
    _._deferredLoadViewportExcess = 300; // load defferred sections within this many px of viewport
    _._deferredWatcherRunning = false;

    _.init = function () {
      $(document).on('shopify:section:load', function (e) {
        // load a new section
        var target = _._themeSectionTargetFromShopifySectionTarget(e.target);
        if (target) {
          _.sectionLoad(target);
        }
      }).on('shopify:section:unload', function (e) {
        // unload existing section
        var target = _._themeSectionTargetFromShopifySectionTarget(e.target);
        if (target) {
          _.sectionUnload(target);
        }
      });
      $(window).on('throttled-scroll.themeSectionDeferredLoader debouncedresize.themeSectionDeferredLoader', _._processDeferredSections);
      _._deferredWatcherRunning = true;
    };

    // register a type of section
    _.register = function (type, section, options) {
      _._sections.push({
        type: type,
        section: section,
        afterSectionLoadCallback: options ? options.afterLoad : null,
        afterSectionUnloadCallback: options ? options.afterUnload : null });


      // load now
      $('[data-section-type="' + type + '"]').each(function () {
        if (Shopify.designMode || options && options.deferredLoad === false || !_._deferredWatcherRunning) {
          _.sectionLoad(this);
        } else {
          _.sectionDeferredLoad(this, options);
        }
      });
    };

    // prepare a section to load later
    _.sectionDeferredLoad = function (target, options) {
      _._deferredSectionTargets.push({
        target: target,
        deferredLoadViewportExcess: options && options.deferredLoadViewportExcess ? options.deferredLoadViewportExcess : _._deferredLoadViewportExcess });

      _._processDeferredSections(true);
    };

    // load deferred sections if in/near viewport
    _._processDeferredSections = function (firstRunCheck) {
      if (_._deferredSectionTargets.length) {
        var viewportTop = $(window).scrollTop(),
        viewportBottom = viewportTop + $(window).height(),
        loopStart = firstRunCheck === true ? _._deferredSectionTargets.length - 1 : 0;
        for (var i = loopStart; i < _._deferredSectionTargets.length; i++) {
          var target = _._deferredSectionTargets[i].target,
          viewportExcess = _._deferredSectionTargets[i].deferredLoadViewportExcess,
          sectionTop = $(target).offset().top - viewportExcess,
          doLoad = sectionTop > viewportTop && sectionTop < viewportBottom;
          if (!doLoad) {
            var sectionBottom = sectionTop + $(target).outerHeight() + viewportExcess * 2;
            doLoad = sectionBottom > viewportTop && sectionBottom < viewportBottom;
          }
          if (doLoad || sectionTop < viewportTop && sectionBottom > viewportBottom) {
            // in viewport, load
            _.sectionLoad(target);
            // remove from deferred queue and resume checks
            _._deferredSectionTargets.splice(i, 1);
            i--;
          }
        }
      }

      // remove event if no more deferred targets left, if not on first run
      if (firstRunCheck !== true && _._deferredSectionTargets.length === 0) {
        _._deferredWatcherRunning = false;
        $(window).off('.themeSectionDeferredLoader');
      }
    };

    // load in a section
    _.sectionLoad = function (target) {
      var target = target,
      sectionObj = _._sectionForTarget(target),
      section = false;

      if (sectionObj.section) {
        section = sectionObj.section;
      } else {
        section = sectionObj;
      }

      if (section !== false) {
        var instance = {
          target: target,
          section: section,
          $shopifySectionContainer: $(target).closest('.shopify-section'),
          thisContext: {
            functions: section.functions } };


        _._instances.push(instance);

        //Initialise any components
        if ($(target).data('components')) {
          //Init each component
          var components = $(target).data('components').split(',');
          components.forEach(component => {
            $(document).trigger('cc:component:load', [component, target]);
          });
        }

        _._callSectionWith(section, 'onSectionLoad', target, instance.thisContext);
        _._callSectionWith(section, 'afterSectionLoadCallback', target, instance.thisContext);

        // attach additional UI events if defined
        if (section.onSectionSelect) {
          instance.$shopifySectionContainer.on('shopify:section:select', function (e) {
            _._callSectionWith(section, 'onSectionSelect', e.target, instance.thisContext);
          });
        }
        if (section.onSectionDeselect) {
          instance.$shopifySectionContainer.on('shopify:section:deselect', function (e) {
            _._callSectionWith(section, 'onSectionDeselect', e.target, instance.thisContext);
          });
        }
        if (section.onBlockSelect) {
          $(target).on('shopify:block:select', function (e) {
            _._callSectionWith(section, 'onBlockSelect', e.target, instance.thisContext);
          });
        }
        if (section.onBlockDeselect) {
          $(target).on('shopify:block:deselect', function (e) {
            _._callSectionWith(section, 'onBlockDeselect', e.target, instance.thisContext);
          });
        }
      }
    };

    // unload a section
    _.sectionUnload = function (target) {
      var sectionObj = _._sectionForTarget(target);
      var instanceIndex = -1;
      for (var i = 0; i < _._instances.length; i++) {
        if (_._instances[i].target == target) {
          instanceIndex = i;
        }
      }
      if (instanceIndex > -1) {
        var instance = _._instances[instanceIndex];
        // remove events and call unload, if loaded
        $(target).off('shopify:block:select shopify:block:deselect');
        instance.$shopifySectionContainer.off('shopify:section:select shopify:section:deselect');
        _._callSectionWith(instance.section, 'onSectionUnload', target, instance.thisContext);
        _._callSectionWith(sectionObj, 'afterSectionUnloadCallback', target, instance.thisContext);
        _._instances.splice(instanceIndex);

        //Destroy any components
        if ($(target).data('components')) {
          //Init each component
          var components = $(target).data('components').split(',');
          components.forEach(component => {
            $(document).trigger('cc:component:unload', [component, target]);
          });
        }
      } else {
        // check if it was a deferred section
        for (var i = 0; i < _._deferredSectionTargets.length; i++) {
          if (_._deferredSectionTargets[i].target == target) {
            _._deferredSectionTargets[i].splice(i, 1);
            break;
          }
        }
      }
    };

    // helpers
    _._callSectionWith = function (section, method, container, thisContext) {
      if (typeof section[method] === 'function') {
        try {
          if (thisContext) {
            section[method].bind(thisContext)(container);
          } else {
            section[method](container);
          }
        } catch (ex) {
          var sectionType = container.dataset['sectionType'];
          console.log("Theme warning: '".concat(method, "' failed for section '").concat(sectionType, "'"));
          console.debug(container, ex.stack);
        }
      }
    };

    _._themeSectionTargetFromShopifySectionTarget = function (target) {
      var $target = $('[data-section-type]:first', target);
      if ($target.length > 0) {
        return $target[0];
      } else {
        return false;
      }
    };

    _._sectionForTarget = function (target) {
      var type = $(target).attr('data-section-type');
      for (var i = 0; i < _._sections.length; i++) {
        if (_._sections[i].type == type) {
          return _._sections[i];
        }
      }
      return false;
    };

    _._sectionAlreadyRegistered = function (type) {
      for (var i = 0; i < _._sections.length; i++) {
        if (_._sections[i].type == type) {
          return true;
        }
      }
      return false;
    };
  }();
  class ccComponent {
    constructor(name) {var cssSelector = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : ".cc-".concat(name);
      var _this = this;
      this.instances = [];

      // Initialise any instance of this component within a section
      $(document).on('cc:component:load', function (event, component, target) {
        if (component === name) {
          $(target).find("".concat(cssSelector, ":not(.cc-initialized)")).each(function () {
            _this.init(this);
          });
        }
      });

      // Destroy any instance of this component within a section
      $(document).on('cc:component:unload', function (event, component, target) {
        if (component === name) {
          $(target).find(cssSelector).each(function () {
            _this.destroy(this);
          });
        }
      });

      // Initialise any instance of this component
      $(cssSelector).each(function () {
        _this.init(this);
      });
    }

    init(container) {
      $(container).addClass('cc-initialized');
    }

    destroy(container) {
      $(container).removeClass('cc-initialized');
    }

    registerInstance(container, instance) {
      this.instances.push({
        container,
        instance });

    }

    destroyInstance(container) {
      this.instances = this.instances.filter(item => {
        if (item.container === container) {
          if (typeof item.instance.destroy === 'function') {
            item.instance.destroy();
          }

          return item.container !== container;
        }
      });
    }}

  (function () {
    function throttle(callback, threshold) {
      var debounceTimeoutId = -1;
      var tick = false;

      return function () {
        clearTimeout(debounceTimeoutId);
        debounceTimeoutId = setTimeout(callback, threshold);

        if (!tick) {
          callback.call();
          tick = true;
          setTimeout(function () {
            tick = false;
          }, threshold);
        }
      };
    }

    var scrollEvent = document.createEvent('Event');
    scrollEvent.initEvent('throttled-scroll', true, true);

    window.addEventListener("scroll", throttle(function () {
      window.dispatchEvent(scrollEvent);
    }, 200));

  })();
  theme.Shopify = {
    formatMoney: function formatMoney(t, r) {
      function e(t, r) {
        return void 0 === t ? r : t;
      }
      function a(t, r, a, o) {
        if (r = e(r, 2),
        a = e(a, ","),
        o = e(o, "."),
        isNaN(t) || null == t)
        return 0;
        t = (t / 100).toFixed(r);
        var n = t.split(".");
        return n[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1" + a) + (n[1] ? o + n[1] : "");
      }
      "string" == typeof t && (t = t.replace(".", ""));
      var o = "",
      n = /\{\{\s*(\w+)\s*\}\}/,
      i = r || this.money_format;
      switch (i.match(n)[1]) {
        case "amount":
          o = a(t, 2);
          break;
        case "amount_no_decimals":
          o = a(t, 0);
          break;
        case "amount_with_comma_separator":
          o = a(t, 2, ".", ",");
          break;
        case "amount_with_space_separator":
          o = a(t, 2, " ", ",");
          break;
        case "amount_with_period_and_space_separator":
          o = a(t, 2, " ", ".");
          break;
        case "amount_no_decimals_with_comma_separator":
          o = a(t, 0, ".", ",");
          break;
        case "amount_no_decimals_with_space_separator":
          o = a(t, 0, " ", "");
          break;
        case "amount_with_apostrophe_separator":
          o = a(t, 2, "'", ".");
          break;
        case "amount_with_decimal_separator":
          o = a(t, 2, ".", ".");}

      return i.replace(n, o);
    },
    formatImage: function formatImage(originalImageUrl, format) {
      return originalImageUrl ? originalImageUrl.replace(/^(.*)\.([^\.]*)$/g, '$1_' + format + '.$2') : '';
    },
    Image: {
      imageSize: function imageSize(t) {
        var e = t.match(/.+_((?:pico|icon|thumb|small|compact|medium|large|grande)|\d{1,4}x\d{0,4}|x\d{1,4})[_\.@]/);
        return null !== e ? e[1] : null;
      },
      getSizedImageUrl: function getSizedImageUrl(t, e) {
        if (null == e)
        return t;
        if ("master" == e)
        return this.removeProtocol(t);
        var o = t.match(/\.(jpg|jpeg|gif|png|bmp|bitmap|tiff|tif)(\?v=\d+)?$/i);
        if (null != o) {
          var i = t.split(o[0]),
          r = o[0];
          return this.removeProtocol(i[0] + "_" + e + r);
        }
        return null;
      },
      removeProtocol: function removeProtocol(t) {
        return t.replace(/http(s)?:/, "");
      } } };


  theme.Disclosure = function () {
    var selectors = {
      disclosureList: '[data-disclosure-list]',
      disclosureToggle: '[data-disclosure-toggle]',
      disclosureInput: '[data-disclosure-input]',
      disclosureOptions: '[data-disclosure-option]' };


    var classes = {
      listVisible: 'disclosure-list--visible' };


    function Disclosure($disclosure) {
      this.$container = $disclosure;
      this.cache = {};
      this._cacheSelectors();
      this._connectOptions();
      this._connectToggle();
      this._onFocusOut();
    }

    Disclosure.prototype = $.extend({}, Disclosure.prototype, {
      _cacheSelectors: function _cacheSelectors() {
        this.cache = {
          $disclosureList: this.$container.find(selectors.disclosureList),
          $disclosureToggle: this.$container.find(selectors.disclosureToggle),
          $disclosureInput: this.$container.find(selectors.disclosureInput),
          $disclosureOptions: this.$container.find(selectors.disclosureOptions) };

      },

      _connectToggle: function _connectToggle() {
        this.cache.$disclosureToggle.on(
        'click',
        function (evt) {
          var ariaExpanded =
          $(evt.currentTarget).attr('aria-expanded') === 'true';
          $(evt.currentTarget).attr('aria-expanded', !ariaExpanded);

          this.cache.$disclosureList.toggleClass(classes.listVisible);
        }.bind(this));

      },

      _connectOptions: function _connectOptions() {
        this.cache.$disclosureOptions.on(
        'click',
        function (evt) {
          evt.preventDefault();
          this._submitForm($(evt.currentTarget).data('value'));
        }.bind(this));

      },

      _onFocusOut: function _onFocusOut() {
        this.cache.$disclosureToggle.on(
        'focusout',
        function (evt) {
          var disclosureLostFocus =
          this.$container.has(evt.relatedTarget).length === 0;

          if (disclosureLostFocus) {
            this._hideList();
          }
        }.bind(this));


        this.cache.$disclosureList.on(
        'focusout',
        function (evt) {
          var childInFocus =
          $(evt.currentTarget).has(evt.relatedTarget).length > 0;
          var isVisible = this.cache.$disclosureList.hasClass(
          classes.listVisible);


          if (isVisible && !childInFocus) {
            this._hideList();
          }
        }.bind(this));


        this.$container.on(
        'keyup',
        function (evt) {
          if (evt.which !== 27) return; // escape
          this._hideList();
          this.cache.$disclosureToggle.focus();
        }.bind(this));


        this.bodyOnClick = function (evt) {
          var isOption = this.$container.has(evt.target).length > 0;
          var isVisible = this.cache.$disclosureList.hasClass(
          classes.listVisible);


          if (isVisible && !isOption) {
            this._hideList();
          }
        }.bind(this);

        $('body').on('click', this.bodyOnClick);
      },

      _submitForm: function _submitForm(value) {
        this.cache.$disclosureInput.val(value);
        this.$container.parents('form').submit();
      },

      _hideList: function _hideList() {
        this.cache.$disclosureList.removeClass(classes.listVisible);
        this.cache.$disclosureToggle.attr('aria-expanded', false);
      },

      unload: function unload() {
        $('body').off('click', this.bodyOnClick);
        this.cache.$disclosureOptions.off();
        this.cache.$disclosureToggle.off();
        this.cache.$disclosureList.off();
        this.$container.off();
      } });


    return Disclosure;
  }();
  // Loading third party scripts
  theme.scriptsLoaded = {};
  theme.loadScriptOnce = function (src, callback, beforeRun, sync) {
    if (typeof theme.scriptsLoaded[src] === 'undefined') {
      theme.scriptsLoaded[src] = [];
      var tag = document.createElement('script');
      tag.src = src;

      if (sync || beforeRun) {
        tag.async = false;
      }

      if (beforeRun) {
        beforeRun();
      }

      if (typeof callback === 'function') {
        theme.scriptsLoaded[src].push(callback);
        if (tag.readyState) {// IE, incl. IE9
          tag.onreadystatechange = function () {
            if (tag.readyState == "loaded" || tag.readyState == "complete") {
              tag.onreadystatechange = null;
              for (var i = 0; i < theme.scriptsLoaded[this].length; i++) {
                theme.scriptsLoaded[this][i]();
              }
              theme.scriptsLoaded[this] = true;
            }
          }.bind(src);
        } else {
          tag.onload = function () {// Other browsers
            for (var i = 0; i < theme.scriptsLoaded[this].length; i++) {
              theme.scriptsLoaded[this][i]();
            }
            theme.scriptsLoaded[this] = true;
          }.bind(src);
        }
      }

      var firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      return true;
    } else if (typeof theme.scriptsLoaded[src] === 'object' && typeof callback === 'function') {
      theme.scriptsLoaded[src].push(callback);
    } else {
      if (typeof callback === 'function') {
        callback();
      }
      return false;
    }
  };

  theme.loadStyleOnce = function (src) {
    var srcWithoutProtocol = src.replace(/^https?:/, '');
    if (!document.querySelector('link[href="' + encodeURI(srcWithoutProtocol) + '"]')) {
      var tag = document.createElement('link');
      tag.href = srcWithoutProtocol;
      tag.rel = 'stylesheet';
      tag.type = 'text/css';
      var firstTag = document.getElementsByTagName('link')[0];
      firstTag.parentNode.insertBefore(tag, firstTag);
    }
  };theme.cartNoteMonitor = {
    load: function load($notes) {
      $notes.on('change.themeCartNoteMonitor paste.themeCartNoteMonitor keyup.themeCartNoteMonitor', function () {
        theme.cartNoteMonitor.postUpdate($(this).val());
      });
    },

    unload: function unload($notes) {
      $notes.off('.themeCartNoteMonitor');
    },

    updateThrottleTimeoutId: -1,
    updateThrottleInterval: 500,

    postUpdate: function postUpdate(val) {
      clearTimeout(theme.cartNoteMonitor.updateThrottleTimeoutId);
      theme.cartNoteMonitor.updateThrottleTimeoutId = setTimeout(function () {
        $.post(theme.routes.cart_url + '/update.js', {
          note: val },
        function (data) {}, 'json');
      }, theme.cartNoteMonitor.updateThrottleInterval);
    } };

  class CustomSelectInstance {
    constructor(el) {
      this.el = el;
      this.button = el.querySelector('.cc-select__btn');
      this.listbox = el.querySelector('.cc-select__listbox');
      this.options = el.querySelectorAll('.cc-select__option');
      this.selectedOption = el.querySelector('[aria-selected="true"]');
      this.nativeSelect = document.getElementById("".concat(el.id, "-native"));
      this.swatches = 'swatch' in this.options[this.options.length - 1].dataset;
      this.focusedClass = 'is-focused';
      this.searchString = '';
      this.listboxOpen = false;

      // Set the selected option
      if (!this.selectedOption) {
        this.selectedOption = this.listbox.firstElementChild;
      }

      this.bindEvents();
      this.setButtonWidth();
    }

    bindEvents() {
      this.el.addEventListener('keydown', this.handleKeydown.bind(this));
      this.el.addEventListener('selectOption', this.handleSelectOption.bind(this));
      this.button.addEventListener('mousedown', this.handleMousedown.bind(this));
    }

    /**
     * Adds event listeners when the options list is visible
     */
    addListboxOpenEvents() {
      this.mouseoverHandler = this.handleMouseover.bind(this);
      this.mouseleaveHandler = this.handleMouseleave.bind(this);
      this.clickHandler = this.handleClick.bind(this);
      this.blurHandler = this.handleBlur.bind(this);

      this.listbox.addEventListener('mouseover', this.mouseoverHandler);
      this.listbox.addEventListener('mouseleave', this.mouseleaveHandler);
      this.listbox.addEventListener('click', this.clickHandler);
      this.listbox.addEventListener('blur', this.blurHandler);
    }

    /**
     * Removes event listeners added when the options list was visible
     */
    removeListboxOpenEvents() {
      this.listbox.removeEventListener('mouseover', this.mouseoverHandler);
      this.listbox.removeEventListener('mouseleave', this.mouseleaveHandler);
      this.listbox.removeEventListener('click', this.clickHandler);
      this.listbox.removeEventListener('blur', this.blurHandler);
    }

    /**
     * Handles a 'keydown' event on the custom select element
     * @param {Object} e - The event object
     */
    handleKeydown(e) {
      if (this.listboxOpen) {
        this.handleKeyboardNav(e);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        this.showListbox();
      }
    }

    /**
     * Handles a 'mousedown' event on the button element
     * @param {Object} e - The event object
     */
    handleMousedown(e) {
      if (!this.listboxOpen && e.button === 0) {
        this.showListbox();
      }
    }

    /**
     * Handles a 'mouseover' event on the options list
     * @param {Object} e - The event object
     */
    handleMouseover(e) {
      if (e.target.matches('li')) {
        this.focusOption(e.target);
      }
    }

    /**
     * Handles a 'mouseleave' event on the options list
     */
    handleMouseleave() {
      this.focusOption(this.selectedOption);
    }

    /**
     * Handles a 'click' event on the options list
     * @param {Object} e - The event object
     */
    handleClick(e) {
      if (e.target.matches('.js-option')) {
        this.selectOption(e.target);
      }
    }

    /**
     * Handles a 'blur' event on the options list
     */
    handleBlur() {
      if (this.listboxOpen) {
        this.hideListbox();
      }
    }

    /**
     * Handles a 'keydown' event on the options list
     * @param {Object} e - The event object
     */
    handleKeyboardNav(e) {
      var optionToFocus;

      // Disable tabbing if options list is open (as per native select element)
      if (e.key === 'Tab') {
        e.preventDefault();
      }

      switch (e.key) {
        // Focus an option
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault();

          if (e.key === 'ArrowUp') {
            optionToFocus = this.focusedOption.previousElementSibling;
          } else {
            optionToFocus = this.focusedOption.nextElementSibling;
          }

          if (optionToFocus && !optionToFocus.classList.contains('is-disabled')) {
            this.focusOption(optionToFocus);
          }
          break;

        // Select an option
        case 'Enter':
        case ' ':
          e.preventDefault();
          this.selectOption(this.focusedOption);
          break;

        // Cancel and close the options list
        case 'Escape':
          e.preventDefault();
          this.hideListbox();
          break;

        // Search for an option and focus the first match (if one exists)
        default:
          optionToFocus = this.findOption(e.key);

          if (optionToFocus) {
            this.focusOption(optionToFocus);
          }
          break;}

    }

    /**
     * Sets the button width to the same as the longest option, to prevent
     * the button width from changing depending on the option selected
     */
    setButtonWidth() {
      // Get the width of an element without side padding
      var getUnpaddedWidth = el => {
        var elStyle = getComputedStyle(el);
        return parseFloat(elStyle.paddingLeft) + parseFloat(elStyle.paddingRight);
      };

      var buttonPadding = getUnpaddedWidth(this.button);
      var optionPadding = getUnpaddedWidth(this.selectedOption);
      var buttonBorder = this.button.offsetWidth - this.button.clientWidth;
      var optionWidth = Math.ceil(this.selectedOption.getBoundingClientRect().width);

      this.button.style.width = "".concat(optionWidth - optionPadding + buttonPadding + buttonBorder, "px");
    }

    /**
     * Shows the options list
     */
    showListbox() {
      this.listbox.hidden = false;
      this.listboxOpen = true;

      this.el.classList.add('is-open');
      this.button.setAttribute('aria-expanded', 'true');
      this.listbox.setAttribute('aria-hidden', 'false');

      // Slight delay required to prevent blur event being fired immediately
      setTimeout(() => {
        this.focusOption(this.selectedOption);
        this.listbox.focus();

        this.addListboxOpenEvents();
      }, 10);
    }

    /**
     * Hides the options list
     */
    hideListbox() {
      if (!this.listboxOpen) return;

      this.listbox.hidden = true;
      this.listboxOpen = false;

      this.el.classList.remove('is-open');
      this.button.setAttribute('aria-expanded', 'false');
      this.listbox.setAttribute('aria-hidden', 'true');

      if (this.focusedOption) {
        this.focusedOption.classList.remove(this.focusedClass);
        this.focusedOption = null;
      }

      this.button.focus();
      this.removeListboxOpenEvents();
    }

    /**
     * Finds a matching option from a typed string
     * @param {string} key - The key pressed
     * @returns {?HTMLElement}
     */
    findOption(key) {
      this.searchString += key;

      // If there's a timer already running, clear it
      if (this.searchTimer) {
        clearTimeout(this.searchTimer);
      }

      // Wait 500ms to see if another key is pressed, if not then clear the search string
      this.searchTimer = setTimeout(() => {
        this.searchString = '';
      }, 500);

      // Find an option that contains the search string (if there is one)
      var matchingOption = [...this.options].find(option => {
        var label = option.innerText.toLowerCase();
        return label.includes(this.searchString) && !option.classList.contains('is-disabled');
      });

      return matchingOption;
    }

    /**
     * Focuses an option
     * @param {HTMLElement} option - The <li> element of the option to focus
     */
    focusOption(option) {
      // Remove focus on currently focused option (if there is one)
      if (this.focusedOption) {
        this.focusedOption.classList.remove(this.focusedClass);
      }

      // Set focus on the option
      this.focusedOption = option;
      this.focusedOption.classList.add(this.focusedClass);

      // If option is out of view, scroll the list
      if (this.listbox.scrollHeight > this.listbox.clientHeight) {
        var scrollBottom = this.listbox.clientHeight + this.listbox.scrollTop;
        var optionBottom = option.offsetTop + option.offsetHeight;

        if (optionBottom > scrollBottom) {
          this.listbox.scrollTop = optionBottom - this.listbox.clientHeight;
        } else if (option.offsetTop < this.listbox.scrollTop) {
          this.listbox.scrollTop = option.offsetTop;
        }
      }
    }

    /**
     * Handles a 'selectOption' event on the custom select element
     * @param {Object} e - The event object (pass value in detail.value)
     */
    handleSelectOption(e) {
      var matchingOption = [...this.options].find(option => option.dataset.value === e.detail.value);
      if (matchingOption) {
        this.selectOption(matchingOption);
      }
    }

    /**
     * Selects an option
     * @param {HTMLElement} option - The option <li> element
     */
    selectOption(option) {
      if (option !== this.selectedOption) {
        // Switch aria-selected attribute to selected option
        option.setAttribute('aria-selected', 'true');
        this.selectedOption.setAttribute('aria-selected', 'false');

        // Update swatch colour in the button
        if (this.swatches) {
          if (option.dataset.swatch) {
            this.button.dataset.swatch = option.dataset.swatch;
          } else {
            this.button.removeAttribute('data-swatch');
          }
        }

        // Update the button text and set the option as active
        this.button.firstChild.textContent = option.firstElementChild.textContent;
        this.listbox.setAttribute('aria-activedescendant', option.id);
        this.selectedOption = document.getElementById(option.id);

        // If a native select element exists, update its selected value and trigger a 'change' event
        if (this.nativeSelect) {
          this.nativeSelect.value = option.dataset.value;
          this.nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          // Trigger a 'change' event on the custom select element
          var detail = { selectedValue: option.dataset.value };
          this.el.dispatchEvent(new CustomEvent('change', { bubbles: true, detail }));
        }
      }

      this.hideListbox();
    }}


  class CustomSelect extends ccComponent {
    constructor() {var name = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'custom-select';var cssSelector = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : ".cc-select";
      super(name, cssSelector);
    }

    init(container) {
      super.init(container);
      this.registerInstance(container, new CustomSelectInstance(container));
    }

    destroy(container) {
      this.destroyInstance(container);
      super.destroy(container);
    }}


  new CustomSelect();
  class FacetFiltersInstance {
    constructor(el) {
      this.filteringEnabled = el.dataset.filtering === 'true';
      this.sortingEnabled = el.dataset.sorting === 'true';

      this.filtersControl = document.querySelector('.cc-filters-control');
      this.filtersContainer = document.querySelector('.cc-filters-container');
      this.results = document.querySelector('.cc-filters-results');

      if (this.filteringEnabled) {
        this.filters = document.querySelector('.cc-filters');
        this.filtersFooter = document.querySelector('.cc-filters__footer');
        this.activeFilters = document.querySelector('.cc-active-filters');
        this.clearFiltersBtn = document.querySelector('.js-clear-filters');
      }

      if (this.sortingEnabled) {
        this.sortBy = document.querySelector('.cc-filter--sort');
        this.activeSortText = document.querySelector('.cc-sort-selected');
      }

      this.utils = {
        hidden: 'is-hidden',
        loading: 'is-loading',
        open: 'is-open',
        filtersOpen: 'filters-open' };


      if (this.filteringEnabled && !this.filtersFooter.classList.contains(this.utils.hidden)) {
        this.filters.style.height = "calc(100% - ".concat(this.filtersFooter.offsetHeight, "px)");
      }

      this.bindEvents();
    }

    bindEvents() {
      this.filtersControl.addEventListener('click', this.handleControlClick.bind(this));
      this.filtersContainer.addEventListener('click', this.handleFiltersClick.bind(this));
      this.filtersContainer.addEventListener('input', this.debounce(this.handleFilterChange.bind(this), 500));

      if (this.filteringEnabled) {
        if (document.querySelector('.cc-price-range')) {
          this.filtersContainer.addEventListener('change', this.debounce(this.handleFilterChange.bind(this), 500));
        }

        this.activeFilters.addEventListener('click', this.handleActiveFiltersClick.bind(this));
      }

      document.addEventListener('click', this.handleClickOutside.bind(this));
      window.addEventListener('popstate', this.handleHistoryChange.bind(this));
    }

    debounce(fn, wait) {var _this2 = this;
      var timer;

      return function () {for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {args[_key] = arguments[_key];}
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(_this2, args), wait);
      };
    }

    /**
     * Handles 'click' event on the filter/sort buttons (mobile only)
     * @param {Object} e - The event object
     */
    handleControlClick(e) {
      if (!e.target.matches('.cc-filters-control__btn')) return;
      document.body.classList.add(this.utils.filtersOpen);

      if (e.target.matches('.js-show-filters')) {
        this.filters.classList.add(this.utils.open);
      } else {
        this.sortBy.open = true;

        // Slight delay required before starting transition
        setTimeout(() => {
          this.sortBy.classList.add(this.utils.open);
        }, 10);
      }
    }

    /**
     * Handles 'click' event on the filters container
     * @param {Object} e - The event object
     */
    handleFiltersClick(e) {
      var { target } = e;
      var filter = target.closest('.cc-filter');

      // Filter 'clear' button clicked
      if (target.matches('.cc-filter-clear-btn')) {
        e.preventDefault();
        this.applyFilters(new URL(e.target.href).searchParams.toString(), e);
        return;
      }

      // Filters/Sort 'close' button, '[x] results' button or 'apply' button clicked (mobile only)
      if (target.matches('.js-close-filters')) {
        if (filter) {
          // Delay to allow for filter closing transition
          setTimeout(() => {
            filter.classList.remove(this.utils.open);
            filter.open = false;
          }, 300);
        }

        if (this.filteringEnabled) {
          this.filters.classList.remove(this.utils.open);
        }

        document.body.classList.remove(this.utils.filtersOpen);
        return;
      }

      if (target.matches('.cc-filter__toggle') || target.matches('.cc-filter-back-btn')) {
        var openFilter = document.querySelector(".cc-filter[open]:not([data-index=\"".concat(filter.dataset.index, "\"])"));

        // If a filter was opened (tablet/desktop) and there's one already open, close it
        if (openFilter) {
          this.closeFilter(openFilter, false);
        }

        // Open/close the filter, class added to allow for css transition
        if (!filter.classList.contains(this.utils.open)) {
          setTimeout(() => {
            filter.classList.add(this.utils.open);
          }, 10);
        } else {
          e.preventDefault();
          this.closeFilter(filter);
        }
      }
    }

    /**
     * Handles 'click' event outside the filters (tablet/desktop)
     * @param {Object} e - The event object
     */
    handleClickOutside(e) {
      var openFilter = document.querySelector(".cc-filter.".concat(this.utils.open));

      // If there's a filter open and the click event wasn't on it, close it (tablet/desktop)
      if (openFilter) {
        var filter = e.target.closest('.cc-filter');

        if (!filter || filter !== openFilter) {
          this.closeFilter(openFilter);
        }
      }
    }

    /**
     * Handles 'input' and 'change' events on the filters and sort by
     * @param {Object} e - The event object
     */
    handleFilterChange(e) {
      // Ignore 'change' events not triggered by user moving the price range slider
      if (e.type === 'change' && (!e.detail || e.detail.sender !== 'theme:component:price_range')) return;

      // If price min/max input value changed, dispatch 'change' event to trigger update of the slider
      if (e.type === 'input' && e.target.classList.contains('cc-price-range__input')) {
        e.target.dispatchEvent(new Event('change', { bubbles: true }));
      }

      var formData = new FormData(document.getElementById('filters'));
      var searchParams = new URLSearchParams(formData);

      this.applyFilters(searchParams.toString(), e);
    }

    /**
     * Handles 'click' event on the active filters
     * @param {Object} e - The event object
     */
    handleActiveFiltersClick(e) {
      e.preventDefault();

      if (e.target.tagName === 'A') {
        this.applyFilters(new URL(e.target.href).searchParams.toString(), e);
      }
    }

    /**
     * Handles history changes (e.g. back button clicked)
     * @param {Object} e - The event object
     */
    handleHistoryChange(e) {
      var searchParams = '';

      if (e.state && e.state.searchParams) {
        searchParams = e.state.searchParams;
      }

      this.applyFilters(searchParams, null, false);
    }

    /**
     * Fetches the filtered/sorted page data and updates the current page
     * @param {string} searchParams - The filter/sort search parameters
     * @param {Object} e - The event object
     * @param {boolean} [updateUrl=true] - Whether to update the url with the selected filter/sort options
     */
    applyFilters(searchParams, e) {var updateUrl = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
      this.results.classList.add(this.utils.loading);

      fetch("".concat(window.location.pathname, "?").concat(searchParams)).
      then(response => response.text()).
      then(responseText => {
        var html = responseText;
        // Note: DOMParser.parseFromString behaviour is broken in iOS 15, returning incomplete content when referenced immediately
        var fetchedHTML = document.implementation.createHTMLDocument();
        fetchedHTML.documentElement.innerHTML = html;

        if (fetchedHTML.querySelector('.cc-facet-filters')) {
          this.updateFilters(fetchedHTML, e);
        }
        this.results.innerHTML = fetchedHTML.querySelector('.cc-filters-results').innerHTML;
        document.dispatchEvent(new CustomEvent('filters-applied', { bubbles: true }));
        this.results.classList.remove(this.utils.loading);
      });

      if (updateUrl) {
        this.updateURL(searchParams);
      }
    }

    /**
     * Updates the filters relevant to the fetched data
     * @param {html} fetchedHTML - HTML of the fetched page
     * @param {Object} e - The event object
     */
    updateFilters(fetchedHTML, e) {
      // Update the Filter/Sort buttons (mobile only)
      this.filtersControl.innerHTML = fetchedHTML.querySelector('.cc-filters-control').innerHTML;

      // Update the 'selected' option in the 'Sort by' dropdown button (tablet/desktop)
      if (e && e.target.name === 'sort_by') {
        this.activeSortText.textContent = e.target.nextElementSibling.textContent;
      }

      if (!this.filteringEnabled) return;

      document.querySelectorAll('.cc-filter').forEach(filter => {
        var { index } = filter.dataset;
        if (index === '0') return; // Sort by

        var fetchedFilter = fetchedHTML.querySelector(".cc-filter[data-index=\"".concat(index, "\"]"));

        if (filter.dataset.type === 'price_range') {
          this.updateFilter(filter, fetchedFilter, false);

          if (!e || e.target.tagName !== 'INPUT') {
            // Update price fields and trigger update of slider
            filter.querySelectorAll('input').forEach(input => {
              input.value = fetchedHTML.getElementById(input.id).value;
              input.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { sender: 'reset' } }));
            });
          }
        } else {
          if (e && e.target.tagName === 'INPUT') {
            var changedFilter = e.target.closest('.cc-filter');

            this.updateFilter(filter, fetchedFilter, filter.dataset.index !== changedFilter.dataset.index);
          } else {
            this.updateFilter(filter, fetchedFilter, true);
          }
        }
      });

      // Update the active filters
      this.updateActiveFilters(fetchedHTML);

      // Update the 'Clear all' button visibility (mobile only)
      this.clearFiltersBtn.hidden = fetchedHTML.querySelector('.js-clear-filters').hidden;

      // Update the '[x] results' button (mobile only)
      var footerEl = fetchedHTML.querySelector('.cc-filters__footer');
      var footerHidden = footerEl.classList.contains(this.utils.hidden);
      this.filtersFooter.innerHTML = footerEl.innerHTML;
      this.filtersFooter.classList.toggle(this.utils.hidden, footerHidden);
      this.filters.style.height = footerHidden ? null : "calc(100% - ".concat(this.filtersFooter.offsetHeight, "px)");
    }

    /**
     * Updates a filter
     * @param {HTMLElement} filter - The filter element
     * @param {HTMLElement} fetchedFilter - The fetched filter element
     * @param {boolean} updateAll - Whether to update all filter markup or just toggle/header
     */
    updateFilter(filter, fetchedFilter, updateAll) {
      if (updateAll) {
        filter.innerHTML = fetchedFilter.innerHTML;
      } else {
        // Update toggle and header only
        filter.replaceChild(fetchedFilter.querySelector('.cc-filter__toggle'), filter.querySelector('.cc-filter__toggle'));
        filter.querySelector('.cc-filter__header').innerHTML = fetchedFilter.querySelector('.cc-filter__header').innerHTML;
      }
    }

    /**
     * Updates the active filter
     * @param {html} fetchedHTML - HTML of the fetched page
     */
    updateActiveFilters(fetchedHTML) {
      var activeFilters = fetchedHTML.querySelector('.cc-active-filters');

      this.activeFilters.innerHTML = activeFilters.innerHTML;
      this.activeFilters.hidden = !this.activeFilters.querySelector('.cc-active-filter');
    }

    /**
     * Updates the url with the current filter/sort parameters
     * @param {string} searchParams - The filter/sort parameters
     */
    updateURL(searchParams) {
      history.pushState({ searchParams }, '', "".concat(window.location.pathname).concat(searchParams && '?'.concat(searchParams)));
    }

    /**
     * Closes a filter
     * @param {HTMLElement} filter - The filter element
     * @param {boolean} [delay=true] - Whether to wait for the css transition
     */
    closeFilter(filter) {var delay = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
      clearTimeout(this.closeTimer);
      filter.classList.remove(this.utils.open);

      // Delay to allow for filter closing transition
      this.closeTimer = setTimeout(() => {
        filter.open = false;
      }, delay ? 300 : null);
    }}


  class FacetFilters extends ccComponent {
    constructor() {var name = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'facet-filters';var cssSelector = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : ".cc-facet-filters";
      super(name, cssSelector);
    }

    init(container) {
      super.init(container);
      this.registerInstance(container, new FacetFiltersInstance(container));
    }

    destroy(container) {
      this.destroyInstance(container);
      super.destroy(container);
    }}


  new FacetFilters();


  class PriceRangeInstance {
    constructor(container) {
      this.container = container;

      this.selectors = {
        inputMin: '.cc-price-range__input--min',
        inputMax: '.cc-price-range__input--max',
        control: '.cc-price-range__control',
        controlMin: '.cc-price-range__control--min',
        controlMax: '.cc-price-range__control--max',
        bar: '.cc-price-range__bar',
        activeBar: '.cc-price-range__bar-active' };


      this.controls = {
        min: {
          barControl: container.querySelector(this.selectors.controlMin),
          input: container.querySelector(this.selectors.inputMin) },

        max: {
          barControl: container.querySelector(this.selectors.controlMax),
          input: container.querySelector(this.selectors.inputMax) } };



      this.controls.min.value = parseInt(
      this.controls.min.input.value === '' ? this.controls.min.input.placeholder : this.controls.min.input.value);


      this.controls.max.value = parseInt(
      this.controls.max.input.value === '' ? this.controls.max.input.placeholder : this.controls.max.input.value);


      this.valueMin = this.controls.min.input.min;
      this.valueMax = this.controls.min.input.max;
      this.valueRange = this.valueMax - this.valueMin;

      [this.controls.min, this.controls.max].forEach(item => {
        item.barControl.setAttribute('aria-valuemin', this.valueMin);
        item.barControl.setAttribute('aria-valuemax', this.valueMax);
      });

      this.controls.min.barControl.setAttribute('aria-valuenow', this.controls.min.value);
      this.controls.max.barControl.setAttribute('aria-valuenow', this.controls.max.value);

      this.bar = container.querySelector(this.selectors.bar);
      this.activeBar = container.querySelector(this.selectors.activeBar);
      this.inDrag = false;

      this.bindEvents();
      this.render();
    }

    getPxToValueRatio() {
      return this.bar.clientWidth / (this.valueMax - this.valueMin);
    }

    getPcToValueRatio() {
      return 100.0 / (this.valueMax - this.valueMin);
    }

    setActiveControlValue(value, reset) {
      // Clamp & default
      if (this.activeControl === this.controls.min) {
        if (value === '') {
          value = this.valueMin;
        }

        value = Math.max(this.valueMin, value);
        value = Math.min(value, this.controls.max.value);
      } else {
        if (value === '') {
          value = this.valueMax;
        }

        value = Math.min(this.valueMax, value);
        value = Math.max(value, this.controls.min.value);
      }

      // Round
      this.activeControl.value = Math.round(value);

      // Update input
      if (this.activeControl.input.value != this.activeControl.value) {
        if (this.activeControl.value == this.activeControl.input.placeholder) {
          this.activeControl.input.value = '';
        } else {
          this.activeControl.input.value = this.activeControl.value;
        }

        if (!reset) {
          this.activeControl.input.dispatchEvent(
          new CustomEvent('change', { bubbles: true, detail: { sender: 'theme:component:price_range' } }));

        }
      }

      // A11y
      this.activeControl.barControl.setAttribute('aria-valuenow', this.activeControl.value);
    }

    render() {
      this.drawControl(this.controls.min);
      this.drawControl(this.controls.max);
      this.drawActiveBar();
    }

    drawControl(control) {
      control.barControl.style.left = "".concat((control.value - this.valueMin) * this.getPcToValueRatio(), "%");
    }

    drawActiveBar() {
      this.activeBar.style.left = "".concat((this.controls.min.value - this.valueMin) * this.getPcToValueRatio(), "%");
      this.activeBar.style.right = "".concat((this.valueMax - this.controls.max.value) * this.getPcToValueRatio(), "%");
    }

    handleControlTouchStart(e) {
      e.preventDefault();
      this.startDrag(e.target, e.touches[0].clientX);
      this.boundControlTouchMoveEvent = this.handleControlTouchMove.bind(this);
      this.boundControlTouchEndEvent = this.handleControlTouchEnd.bind(this);
      window.addEventListener('touchmove', this.boundControlTouchMoveEvent);
      window.addEventListener('touchend', this.boundControlTouchEndEvent);
    }

    handleControlTouchMove(e) {
      this.moveDrag(e.touches[0].clientX);
    }

    handleControlTouchEnd(e) {
      e.preventDefault();
      window.removeEventListener('touchmove', this.boundControlTouchMoveEvent);
      window.removeEventListener('touchend', this.boundControlTouchEndEvent);
      this.stopDrag();
    }

    handleControlMouseDown(e) {
      e.preventDefault();
      this.startDrag(e.target, e.clientX);
      this.boundControlMouseMoveEvent = this.handleControlMouseMove.bind(this);
      this.boundControlMouseUpEvent = this.handleControlMouseUp.bind(this);
      window.addEventListener('mousemove', this.boundControlMouseMoveEvent);
      window.addEventListener('mouseup', this.boundControlMouseUpEvent);
    }

    handleControlMouseMove(e) {
      this.moveDrag(e.clientX);
    }

    handleControlMouseUp(e) {
      e.preventDefault();
      window.removeEventListener('mousemove', this.boundControlMouseMoveEvent);
      window.removeEventListener('mouseup', this.boundControlMouseUpEvent);
      this.stopDrag();
    }

    startDrag(target, startX) {
      this.activeControl = this.controls.min.barControl === target ? this.controls.min : this.controls.max;
      this.dragStartX = startX;
      this.dragStartValue = this.activeControl.value;
      this.inDrag = true;
    }

    moveDrag(moveX) {
      if (this.inDrag) {
        var value = this.dragStartValue + (moveX - this.dragStartX) / this.getPxToValueRatio();
        this.setActiveControlValue(value);
        this.render();
      }
    }

    stopDrag() {
      this.inDrag = false;
    }

    handleInputChange(e) {
      if (e.target.tagName !== 'INPUT') return;

      if (!e.detail || e.detail.sender !== 'theme:component:price_range') {
        var reset = e.detail && e.detail.sender === 'reset';

        this.activeControl = this.controls.min.input === e.target ? this.controls.min : this.controls.max;
        this.setActiveControlValue(e.target.value, reset);
        this.render();
      }
    }

    bindEvents() {
      [this.controls.min, this.controls.max].forEach(item => {
        item.barControl.addEventListener('touchstart', this.handleControlTouchStart.bind(this));
        item.barControl.addEventListener('mousedown', this.handleControlMouseDown.bind(this));
      });

      this.container.addEventListener('change', this.handleInputChange.bind(this));
    }

    destroy() {}}


  class PriceRange extends ccComponent {
    constructor() {var name = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'price-range';var cssSelector = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : ".cc-".concat(name);
      super(name, cssSelector);
    }

    init(container) {
      super.init(container);
      this.registerInstance(container, new PriceRangeInstance(container));
    }

    destroy(container) {
      this.destroyInstance(container);
      super.destroy(container);
    }}


  new PriceRange();
  class ccPopup {
    constructor($container, namespace) {
      this.$container = $container;
      this.namespace = namespace;
      this.cssClasses = {
        visible: 'cc-popup--visible',
        bodyNoScroll: 'cc-popup-no-scroll',
        bodyNoScrollPadRight: 'cc-popup-no-scroll-pad-right' };

    }

    /**
     * Open popup on timer / local storage - move focus to input ensure you can tab to submit and close
     * Add the cc-popup--visible class
     * Update aria to visible
     */
    open(callback) {
      // Prevent the body from scrolling
      if (this.$container.data('freeze-scroll')) {
        $('body').addClass(this.cssClasses.bodyNoScroll);

        // Add any padding necessary to the body to compensate for the scrollbar that just disappeared
        var scrollDiv = document.createElement('div');
        scrollDiv.className = 'popup-scrollbar-measure';
        document.body.appendChild(scrollDiv);
        var scrollbarWidth = scrollDiv.getBoundingClientRect().width - scrollDiv.clientWidth;
        document.body.removeChild(scrollDiv);
        if (scrollbarWidth > 0) {
          $('body').css('padding-right', scrollbarWidth + 'px').addClass(this.cssClasses.bodyNoScrollPadRight);
        }
      }

      // Add reveal class
      this.$container.addClass(this.cssClasses.visible);

      // Track previously focused element
      this.previouslyActiveElement = document.activeElement;

      // Focus on the close button after the animation in has completed
      setTimeout(() => {
        this.$container.find('.cc-popup-close')[0].focus();
      }, 500);

      // Pressing escape closes the modal
      $(window).on('keydown' + this.namespace, event => {
        if (event.keyCode === 27) {
          this.close();
        }
      });

      if (callback) {
        callback();
      }
    }

    /**
     * Close popup on click of close button or background - where does the focus go back to?
     * Remove the cc-popup--visible class
     */
    close(callback) {
      // Remove reveal class
      this.$container.removeClass(this.cssClasses.visible);

      // Revert focus
      if (this.previouslyActiveElement) {
        $(this.previouslyActiveElement).focus();
      }

      // Destroy the escape event listener
      $(window).off('keydown' + this.namespace);

      // Allow the body to scroll and remove any scrollbar-compensating padding
      if (this.$container.data('freeze-scroll')) {
        var transitionDuration = 500;

        var $innerModal = this.$container.find('.cc-popup-modal');
        if ($innerModal.length) {
          transitionDuration = parseFloat(getComputedStyle($innerModal[0])['transitionDuration']);
          if (transitionDuration && transitionDuration > 0) {
            transitionDuration *= 1000;
          }
        }

        setTimeout(() => {
          $('body').removeClass(this.cssClasses.bodyNoScroll).removeClass(this.cssClasses.bodyNoScrollPadRight).css('padding-right', '0');
        }, transitionDuration);
      }

      if (callback) {
        callback();
      }
    }}
  ;


  theme.MapSection = new function () {
    var _ = this;
    _.config = {
      zoom: 14,
      styles: {
        default: [],
        silver: [{ "elementType": "geometry", "stylers": [{ "color": "#f5f5f5" }] }, { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] }, { "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] }, { "elementType": "labels.text.stroke", "stylers": [{ "color": "#f5f5f5" }] }, { "featureType": "administrative.land_parcel", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] }, { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] }, { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] }, { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] }, { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] }, { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }] }, { "featureType": "road.arterial", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] }, { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#dadada" }] }, { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] }, { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] }, { "featureType": "transit.line", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] }, { "featureType": "transit.station", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] }, { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#c9c9c9" }] }, { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] }],
        retro: [{ "elementType": "geometry", "stylers": [{ "color": "#ebe3cd" }] }, { "elementType": "labels.text.fill", "stylers": [{ "color": "#523735" }] }, { "elementType": "labels.text.stroke", "stylers": [{ "color": "#f5f1e6" }] }, { "featureType": "administrative", "elementType": "geometry.stroke", "stylers": [{ "color": "#c9b2a6" }] }, { "featureType": "administrative.land_parcel", "elementType": "geometry.stroke", "stylers": [{ "color": "#dcd2be" }] }, { "featureType": "administrative.land_parcel", "elementType": "labels.text.fill", "stylers": [{ "color": "#ae9e90" }] }, { "featureType": "landscape.natural", "elementType": "geometry", "stylers": [{ "color": "#dfd2ae" }] }, { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#dfd2ae" }] }, { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#93817c" }] }, { "featureType": "poi.park", "elementType": "geometry.fill", "stylers": [{ "color": "#a5b076" }] }, { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#447530" }] }, { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#f5f1e6" }] }, { "featureType": "road.arterial", "elementType": "geometry", "stylers": [{ "color": "#fdfcf8" }] }, { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#f8c967" }] }, { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#e9bc62" }] }, { "featureType": "road.highway.controlled_access", "elementType": "geometry", "stylers": [{ "color": "#e98d58" }] }, { "featureType": "road.highway.controlled_access", "elementType": "geometry.stroke", "stylers": [{ "color": "#db8555" }] }, { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#806b63" }] }, { "featureType": "transit.line", "elementType": "geometry", "stylers": [{ "color": "#dfd2ae" }] }, { "featureType": "transit.line", "elementType": "labels.text.fill", "stylers": [{ "color": "#8f7d77" }] }, { "featureType": "transit.line", "elementType": "labels.text.stroke", "stylers": [{ "color": "#ebe3cd" }] }, { "featureType": "transit.station", "elementType": "geometry", "stylers": [{ "color": "#dfd2ae" }] }, { "featureType": "water", "elementType": "geometry.fill", "stylers": [{ "color": "#b9d3c2" }] }, { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#92998d" }] }],
        dark: [{ "elementType": "geometry", "stylers": [{ "color": "#212121" }] }, { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] }, { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] }, { "elementType": "labels.text.stroke", "stylers": [{ "color": "#212121" }] }, { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "color": "#757575" }] }, { "featureType": "administrative.country", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] }, { "featureType": "administrative.land_parcel", "stylers": [{ "visibility": "off" }] }, { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] }, { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] }, { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#181818" }] }, { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] }, { "featureType": "poi.park", "elementType": "labels.text.stroke", "stylers": [{ "color": "#1b1b1b" }] }, { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "color": "#2c2c2c" }] }, { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#8a8a8a" }] }, { "featureType": "road.arterial", "elementType": "geometry", "stylers": [{ "color": "#373737" }] }, { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#3c3c3c" }] }, { "featureType": "road.highway.controlled_access", "elementType": "geometry", "stylers": [{ "color": "#4e4e4e" }] }, { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] }, { "featureType": "transit", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] }, { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#000000" }] }, { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#3d3d3d" }] }],
        night: [{ "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] }, { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] }, { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] }, { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] }, { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] }, { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#263c3f" }] }, { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#6b9a76" }] }, { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] }, { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#212a37" }] }, { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#9ca5b3" }] }, { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#746855" }] }, { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#1f2835" }] }, { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#f3d19c" }] }, { "featureType": "transit", "elementType": "geometry", "stylers": [{ "color": "#2f3948" }] }, { "featureType": "transit.station", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] }, { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] }, { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#515c6d" }] }, { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [{ "color": "#17263c" }] }],
        aubergine: [{ "elementType": "geometry", "stylers": [{ "color": "#1d2c4d" }] }, { "elementType": "labels.text.fill", "stylers": [{ "color": "#8ec3b9" }] }, { "elementType": "labels.text.stroke", "stylers": [{ "color": "#1a3646" }] }, { "featureType": "administrative.country", "elementType": "geometry.stroke", "stylers": [{ "color": "#4b6878" }] }, { "featureType": "administrative.land_parcel", "elementType": "labels.text.fill", "stylers": [{ "color": "#64779e" }] }, { "featureType": "administrative.province", "elementType": "geometry.stroke", "stylers": [{ "color": "#4b6878" }] }, { "featureType": "landscape.man_made", "elementType": "geometry.stroke", "stylers": [{ "color": "#334e87" }] }, { "featureType": "landscape.natural", "elementType": "geometry", "stylers": [{ "color": "#023e58" }] }, { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#283d6a" }] }, { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#6f9ba5" }] }, { "featureType": "poi", "elementType": "labels.text.stroke", "stylers": [{ "color": "#1d2c4d" }] }, { "featureType": "poi.park", "elementType": "geometry.fill", "stylers": [{ "color": "#023e58" }] }, { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#3C7680" }] }, { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#304a7d" }] }, { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#98a5be" }] }, { "featureType": "road", "elementType": "labels.text.stroke", "stylers": [{ "color": "#1d2c4d" }] }, { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#2c6675" }] }, { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#255763" }] }, { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#b0d5ce" }] }, { "featureType": "road.highway", "elementType": "labels.text.stroke", "stylers": [{ "color": "#023e58" }] }, { "featureType": "transit", "elementType": "labels.text.fill", "stylers": [{ "color": "#98a5be" }] }, { "featureType": "transit", "elementType": "labels.text.stroke", "stylers": [{ "color": "#1d2c4d" }] }, { "featureType": "transit.line", "elementType": "geometry.fill", "stylers": [{ "color": "#283d6a" }] }, { "featureType": "transit.station", "elementType": "geometry", "stylers": [{ "color": "#3a4762" }] }, { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0e1626" }] }, { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#4e6d70" }] }] } };


    _.apiStatus = null;

    this.geolocate = function ($map) {
      var deferred = $.Deferred();
      var geocoder = new google.maps.Geocoder();
      var address = $map.data('address-setting');

      geocoder.geocode({ address: address }, function (results, status) {
        if (status !== google.maps.GeocoderStatus.OK) {
          deferred.reject(status);
        }

        deferred.resolve(results);
      });

      return deferred;
    };

    this.createMap = function (container) {
      var $map = $('.map-section__map-container', container);

      return _.geolocate($map).
      then(
      function (results) {
        var mapOptions = {
          zoom: _.config.zoom,
          styles: _.config.styles[$(container).data('map-style')],
          center: results[0].geometry.location,
          scrollwheel: false,
          disableDoubleClickZoom: true,
          disableDefaultUI: true,
          zoomControl: true };


        _.map = new google.maps.Map($map[0], mapOptions);
        _.center = _.map.getCenter();

        var marker = new google.maps.Marker({
          map: _.map,
          position: _.center,
          clickable: false });


        google.maps.event.addDomListener(window, 'resize', function () {
          google.maps.event.trigger(_.map, 'resize');
          _.map.setCenter(_.center);
        });
      }.bind(this)).

      fail(function () {
        var errorMessage;

        switch (status) {
          case 'ZERO_RESULTS':
            errorMessage = theme.strings.addressNoResults;
            break;
          case 'OVER_QUERY_LIMIT':
            errorMessage = theme.strings.addressQueryLimit;
            break;
          default:
            errorMessage = theme.strings.addressError;
            break;}


        // Only show error in the theme editor
        if (Shopify.designMode) {
          var $mapContainer = $map.parents('.map-section');

          $mapContainer.addClass('page-width map-section--load-error');
          $mapContainer.
          find('.map-section__wrapper').
          html(
          '<div class="errors text-center">' + errorMessage + '</div>');

        }
      });
    };

    this.onSectionLoad = function (target) {
      var $container = $(target);
      // Global function called by Google on auth errors
      window.gm_authFailure = function () {
        if (!Shopify.designMode) return;

        $container.addClass('page-width map-section--load-error');
        $container.
        find('.map-section__wrapper').
        html(
        '<div class="errors text-center">' + theme.strings.authError + '</div>');

      };

      // create maps
      var key = $container.data('api-key');

      if (typeof key !== 'string' || key === '') {
        return;
      }

      // load map
      theme.loadScriptOnce('https://maps.googleapis.com/maps/api/js?key=' + key, function () {
        _.createMap($container);
      });
    };

    this.onSectionUnload = function (target) {
      if (typeof window.google !== 'undefined' && typeof google.maps !== 'undefined') {
        google.maps.event.clearListeners(_.map, 'resize');
      }
    };
  }();

  // Register the section
  cc.sections.push({
    name: 'map',
    section: theme.MapSection });

  // Manage videos
  theme.VideoManager = new function () {
    var _ = this;

    _._permitPlayback = function (container) {
      return !($(container).hasClass('video-container--background') && $(window).outerWidth() < 768);
    };

    // Youtube
    _.youtubeVars = {
      incrementor: 0,
      apiReady: false,
      videoData: {},
      toProcessSelector: '.video-container[data-video-type="youtube"]:not(.video--init)' };


    _.youtubeApiReady = function () {
      _.youtubeVars.apiReady = true;
      _._loadYoutubeVideos();
    };

    _._loadYoutubeVideos = function (container) {
      if ($(_.youtubeVars.toProcessSelector, container).length) {
        if (_.youtubeVars.apiReady) {

          // play those videos
          $(_.youtubeVars.toProcessSelector, container).each(function () {
            // Don't init background videos on mobile
            if (_._permitPlayback($(this))) {
              $(this).addClass('video--init');
              _.youtubeVars.incrementor++;
              var containerId = 'theme-yt-video-' + _.youtubeVars.incrementor;
              $(this).data('video-container-id', containerId);
              var videoElement = $('<div class="video-container__video-element">').attr('id', containerId).
              appendTo($('.video-container__video', this));
              var autoplay = $(this).data('video-autoplay');
              var loop = $(this).data('video-loop');
              var player = new YT.Player(containerId, {
                height: '360',
                width: '640',
                videoId: $(this).data('video-id'),
                playerVars: {
                  iv_load_policy: 3,
                  modestbranding: 1,
                  autoplay: 0,
                  loop: loop ? 1 : 0,
                  playlist: $(this).data('video-id'),
                  rel: 0,
                  showinfo: 0 },

                events: {
                  onReady: _._onYoutubePlayerReady.bind({ autoplay: autoplay, loop: loop, $container: $(this) }),
                  onStateChange: _._onYoutubePlayerStateChange.bind({ autoplay: autoplay, loop: loop, $container: $(this) }) } });


              _.youtubeVars.videoData[containerId] = {
                id: containerId,
                container: this,
                videoElement: videoElement,
                player: player };

            }
          });
        } else {
          // load api
          theme.loadScriptOnce('https://www.youtube.com/iframe_api');
        }
      }
    };

    _._onYoutubePlayerReady = function (event) {
      event.target.setPlaybackQuality('hd1080');
      if (this.autoplay) {
        event.target.mute();
        event.target.playVideo();
      }

      _._initBackgroundVideo(this.$container);
    };

    _._onYoutubePlayerStateChange = function (event) {
      if (event.data == YT.PlayerState.PLAYING) {
        this.$container.addClass('video--play-started');

        if (this.autoplay) {
          event.target.mute();
        }

        if (this.loop) {
          // 4 times a second, check if we're in the final second of the video. If so, loop it for a more seamless loop
          var finalSecond = event.target.getDuration() - 1;
          if (finalSecond > 2) {
            function loopTheVideo() {
              if (event.target.getCurrentTime() > finalSecond) {
                event.target.seekTo(0);
              }
              setTimeout(loopTheVideo, 250);
            }
            loopTheVideo();
          }
        }
      }
    };

    _._unloadYoutubeVideos = function (container) {
      for (var dataKey in _.youtubeVars.videoData) {
        var data = _.youtubeVars.videoData[dataKey];
        if ($(container).find(data.container).length) {
          data.player.destroy();
          delete _.youtubeVars.videoData[dataKey];
          return;
        }
      }
    };

    // Vimeo
    _.vimeoVars = {
      incrementor: 0,
      apiReady: false,
      videoData: {},
      toProcessSelector: '.video-container[data-video-type="vimeo"]:not(.video--init)' };


    _.vimeoApiReady = function () {
      _.vimeoVars.apiReady = true;
      _._loadVimeoVideos();
    };

    _._loadVimeoVideos = function (container) {
      if ($(_.vimeoVars.toProcessSelector, container).length) {
        if (_.vimeoVars.apiReady) {
          // play those videos

          $(_.vimeoVars.toProcessSelector, container).each(function () {
            // Don't init background videos on mobile
            if (_._permitPlayback($(this))) {
              $(this).addClass('video--init');
              _.vimeoVars.incrementor++;
              var $this = $(this);
              var containerId = 'theme-vi-video-' + _.vimeoVars.incrementor;
              $(this).data('video-container-id', containerId);
              var videoElement = $('<div class="video-container__video-element">').attr('id', containerId).
              appendTo($('.video-container__video', this));
              var autoplay = !!$(this).data('video-autoplay');
              var player = new Vimeo.Player(containerId, {
                url: $(this).data('video-url'),
                width: 640,
                loop: $(this).data('video-autoplay'),
                autoplay: autoplay,
                muted: $this.hasClass('video-container--background') || autoplay });

              player.on('playing', function () {
                $(this).addClass('video--play-started');
              }.bind(this));
              player.ready().then(function () {
                if (autoplay) {
                  player.setVolume(0);
                  player.play();
                }
                if (player.element && player.element.width && player.element.height) {
                  var ratio = parseInt(player.element.height) / parseInt(player.element.width);
                  $this.find('.video-container__video').css('padding-bottom', ratio * 100 + '%');
                }
                _._initBackgroundVideo($this);
              });
              _.vimeoVars.videoData[containerId] = {
                id: containerId,
                container: this,
                videoElement: videoElement,
                player: player,
                autoPlay: autoplay };

            }
          });
        } else {
          // load api
          if (window.define) {
            // workaround for third parties using RequireJS
            theme.loadScriptOnce('https://player.vimeo.com/api/player.js', function () {
              _.vimeoVars.apiReady = true;
              _._loadVimeoVideos();
              window.define = window.tempDefine;
            }, function () {
              window.tempDefine = window.define;
              window.define = null;
            });
          } else {
            theme.loadScriptOnce('https://player.vimeo.com/api/player.js', function () {
              _.vimeoVars.apiReady = true;
              _._loadVimeoVideos();
            });
          }
        }
      }
    };

    _._unloadVimeoVideos = function (container) {
      for (var dataKey in _.vimeoVars.videoData) {
        var data = _.vimeoVars.videoData[dataKey];
        if ($(container).find(data.container).length) {
          data.player.unload();
          delete _.vimeoVars.videoData[dataKey];
          return;
        }
      }
    };

    // Init third party apis - Youtube and Vimeo
    _._loadThirdPartyApis = function (container) {
      //Don't init youtube or vimeo background videos on mobile
      if (_._permitPlayback($('.video-container', container))) {
        _._loadYoutubeVideos(container);
        _._loadVimeoVideos(container);
      }
    };

    // Mp4
    _.mp4Vars = {
      incrementor: 0,
      videoData: {},
      toProcessSelector: '.video-container[data-video-type="mp4"]:not(.video--init)' };


    _._loadMp4Videos = function (container) {
      if ($(_.mp4Vars.toProcessSelector, container).length) {
        // play those videos
        $(_.mp4Vars.toProcessSelector, container).addClass('video--init').each(function () {
          _.mp4Vars.incrementor++;
          var $this = $(this);
          var containerId = 'theme-mp-video-' + _.mp4Vars.incrementor;
          $(this).data('video-container-id', containerId);
          var videoElement = $('<div class="video-container__video-element">').attr('id', containerId).
          appendTo($('.video-container__video', this));

          var $video = $('<video playsinline>');
          if ($(this).data('video-loop')) {
            $video.attr('loop', 'loop');
          }
          if (!$(this).hasClass('video-container--background')) {
            $video.attr('controls', 'controls');
          }
          if ($(this).data('video-autoplay')) {
            $video.attr({ autoplay: 'autoplay', muted: 'muted' });
            $video[0].muted = true; // required by Chrome - ignores attribute
            $video.one('loadeddata', function () {
              this.play();
            });
          }
          $video.on('playing', function () {
            $(this).addClass('video--play-started');
          }.bind(this));
          $video.attr('src', $(this).data('video-url')).appendTo(videoElement);
          _.mp4Vars.videoData[containerId] = {
            element: $video[0] };

        });
      }
    };

    _._unloadMp4Videos = function (container) {
    };

    // background video placement for iframes
    _._initBackgroundVideo = function ($container) {
      if ($container.hasClass('video-container--background') && $container.find('.video-container__video iframe').length) {
        function assessBackgroundVideo() {
          var $media = $('.video-container__media', this),
          $container = $media.length ? $media : this,
          cw = $container.width(),
          ch = $container.height(),
          cr = cw / ch,
          $frame = $('.video-container__video iframe', this),
          vr = $frame.attr('width') / $frame.attr('height'),
          $pan = $('.video-container__video', this),
          vCrop = 75; // pushes video outside container to hide controls
          if (cr > vr) {
            var vh = cw / vr + vCrop * 2;
            $pan.css({
              marginTop: (ch - vh) / 2 - vCrop,
              marginInlineStart: '',
              height: vh + vCrop * 2,
              width: '' });

          } else {
            var vw = cw * vr + vCrop * 2 * vr;
            $pan.css({
              marginTop: -vCrop,
              marginInlineStart: (cw - vw) / 2,
              height: ch + vCrop * 2,
              width: vw });

          }
        }
        assessBackgroundVideo.bind($container)();
        $(window).on('debouncedresize.' + $container.data('video-container-id'), assessBackgroundVideo.bind($container));
      }
    };

    // Compatibility with Sections
    this.onSectionLoad = function (container) {
      // url only - infer type
      $('.video-container[data-video-url]:not([data-video-type])').each(function () {
        var url = $(this).data('video-url');

        if (url.indexOf('.mp4') > -1) {
          $(this).attr('data-video-type', 'mp4');
        }

        if (url.indexOf('vimeo.com') > -1) {
          $(this).attr('data-video-type', 'vimeo');
          $(this).attr('data-video-id', url.split('?')[0].split('/').pop());
        }

        if (url.indexOf('youtu.be') > -1 || url.indexOf('youtube.com') > -1) {
          $(this).attr('data-video-type', 'youtube');
          if (url.indexOf('v=') > -1) {
            $(this).attr('data-video-id', url.split('v=').pop().split('&')[0]);
          } else {
            $(this).attr('data-video-id', url.split('?')[0].split('/').pop());
          }
        }
      });

      _._loadThirdPartyApis(container);
      _._loadMp4Videos(container);

      $(window).on('debouncedresize.video-manager-resize', function () {
        _._loadThirdPartyApis(container);
      });

      // play button
      $('.video-container__play', container).on('click', function (evt) {
        evt.preventDefault();
        var $container = $(this).closest('.video-container');
        // reveal
        $container.addClass('video-container--playing');

        // broadcast a play event on the section container
        $(container).trigger("cc:video:play");

        // play
        var id = $container.data('video-container-id');
        if (id.indexOf('theme-yt-video') === 0) {
          _.youtubeVars.videoData[id].player.playVideo();
        } else if (id.indexOf('theme-vi-video') === 0) {
          _.vimeoVars.videoData[id].player.play();
        } else if (id.indexOf('theme-mp-video') === 0) {
          _.mp4Vars.videoData[id].element.play();
        }
      });

      // modal close button
      $('.video-container__stop', container).on('click', function (evt) {
        evt.preventDefault();
        var $container = $(this).closest('.video-container');
        // hide
        $container.removeClass('video-container--playing');

        // broadcast a stop event on the section container
        $(container).trigger("cc:video:stop");

        // play
        var id = $container.data('video-container-id');
        if (id.indexOf('theme-yt-video') === 0) {
          _.youtubeVars.videoData[id].player.stopVideo();
        } else {
          _.vimeoVars.videoData[id].player.pause();
          _.vimeoVars.videoData[id].player.setCurrentTime(0);
        }
      });
    };

    this.onSectionUnload = function (container) {
      $('.video-container__play, .video-container__stop', container).off('click');
      $(window).off('.' + $('.video-container').data('video-container-id'));
      $(window).off('debouncedresize.video-manager-resize');
      _._unloadYoutubeVideos(container);
      _._unloadVimeoVideos(container);
      _._unloadMp4Videos(container);
      $(container).trigger("cc:video:stop");
    };
  }();

  // Youtube API callback
  window.onYouTubeIframeAPIReady = function () {
    theme.VideoManager.youtubeApiReady();
  };

  // Register the section
  cc.sections.push({
    name: 'video',
    section: theme.VideoManager });

  /**
   * Popup Section Script
   * ------------------------------------------------------------------------------
   *
   * @namespace Popup
   */

  theme.Popup = new function () {
    /**
     * Popup section constructor. Runs on page load as well as Theme Editor
     * `section:load` events.
     * @param {string} container - selector for the section container DOM element
     */

    var dismissedStorageKey = 'cc-theme-popup-dismissed';

    this.onSectionLoad = function (container) {
      this.namespace = theme.namespaceFromSection(container);
      this.$container = $(container);
      this.popup = new ccPopup(this.$container, this.namespace);

      var dismissForDays = this.$container.data('dismiss-for-days'),
      delaySeconds = this.$container.data('delay-seconds'),
      showPopup = true,
      testMode = this.$container.data('test-mode'),
      lastDismissed = window.localStorage.getItem(dismissedStorageKey);

      // Should we show it during this page view?
      // Check when it was last dismissed
      if (lastDismissed) {
        var dismissedDaysAgo = (new Date().getTime() - lastDismissed) / (1000 * 60 * 60 * 24);
        if (dismissedDaysAgo < dismissForDays) {
          showPopup = false;
        }
      }

      // Check for error or success messages
      if (this.$container.find('.cc-popup-form__response').length) {
        showPopup = true;
        delaySeconds = 1;

        // If success, set as dismissed
        if (this.$container.find('.cc-popup-form__response--success').length) {
          this.functions.popupSetAsDismissed.call(this);
        }
      }

      // Prevent popup on Shopify robot challenge page
      if (document.querySelector('.shopify-challenge__container')) {
        showPopup = false;
      }

      // Show popup, if appropriate
      if (showPopup || testMode) {
        setTimeout(() => {
          this.popup.open();
        }, delaySeconds * 1000);
      }

      // Click on close button or modal background
      this.$container.on('click' + this.namespace, '.cc-popup-close, .cc-popup-background', () => {
        this.popup.close(() => {
          this.functions.popupSetAsDismissed.call(this);
        });
      });
    };

    this.onSectionSelect = function () {
      this.popup.open();
    };

    this.functions = {
      /**
       * Use localStorage to set as dismissed
       */
      popupSetAsDismissed: function popupSetAsDismissed() {
        window.localStorage.setItem(dismissedStorageKey, new Date().getTime());
      } };


    /**
     * Event callback for Theme Editor `section:unload` event
     */
    this.onSectionUnload = function () {
      this.$container.off(this.namespace);
    };
  }();

  // Register section
  cc.sections.push({
    name: 'newsletter-popup',
    section: theme.Popup });

  /**
   * StoreAvailability Section Script
   * ------------------------------------------------------------------------------
   *
   * @namespace StoreAvailability
   */

  theme.StoreAvailability = function (container) {
    var loadingClass = 'store-availability-loading';
    var initClass = 'store-availability-initialized';
    var storageKey = 'cc-location';

    this.onSectionLoad = function (container) {
      this.namespace = theme.namespaceFromSection(container);
      this.$container = $(container);
      this.productId = this.$container.data('store-availability-container');
      this.sectionUrl = this.$container.data('section-url');
      this.$modal;

      this.$container.addClass(initClass);
      this.transitionDurationMS = parseFloat(getComputedStyle(container).transitionDuration) * 1000;
      this.removeFixedHeightTimeout = -1;

      // Handle when a variant is selected
      $(window).on("cc-variant-updated".concat(this.namespace).concat(this.productId), (e, args) => {
        if (args.product.id === this.productId) {
          this.functions.updateContent.bind(this)(
          args.variant ? args.variant.id : null,
          args.product.title,
          this.$container.data('has-only-default-variant'),
          args.variant && typeof args.variant.available !== "undefined");

        }
      });

      // Handle single variant products
      if (this.$container.data('single-variant-id')) {
        this.functions.updateContent.bind(this)(
        this.$container.data('single-variant-id'),
        this.$container.data('single-variant-product-title'),
        this.$container.data('has-only-default-variant'),
        this.$container.data('single-variant-product-available'));

      }
    };

    this.onSectionUnload = function () {
      $(window).off("cc-variant-updated".concat(this.namespace).concat(this.productId));
      this.$container.off('click');
      if (this.$modal) {
        this.$modal.off('click');
      }
    };

    this.functions = {
      // Returns the users location data (if allowed)
      getUserLocation: function getUserLocation() {
        return new Promise((resolve, reject) => {
          var storedCoords;

          if (sessionStorage[storageKey]) {
            storedCoords = JSON.parse(sessionStorage[storageKey]);
          }

          if (storedCoords) {
            resolve(storedCoords);

          } else {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
              function (position) {
                var coords = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude };


                //Set the localization api
                fetch('/localization.json', {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json' },

                  body: JSON.stringify(coords) });


                //Write to a session storage
                sessionStorage[storageKey] = JSON.stringify(coords);

                resolve(coords);
              }, function () {
                resolve(false);
              }, {
                maximumAge: 3600000, // 1 hour
                timeout: 5000 });


            } else {
              resolve(false);
            }
          }
        });
      },

      // Requests the available stores and calls the callback
      getAvailableStores: function getAvailableStores(variantId, cb) {
        return $.get(this.sectionUrl.replace('VARIANT_ID', variantId), cb);
      },

      // Haversine Distance
      // The haversine formula is an equation giving great-circle distances between
      // two points on a sphere from their longitudes and latitudes
      calculateDistance: function calculateDistance(coords1, coords2, unitSystem) {
        var dtor = Math.PI / 180;
        var radius = unitSystem === 'metric' ? 6378.14 : 3959;

        var rlat1 = coords1.latitude * dtor;
        var rlong1 = coords1.longitude * dtor;
        var rlat2 = coords2.latitude * dtor;
        var rlong2 = coords2.longitude * dtor;

        var dlon = rlong1 - rlong2;
        var dlat = rlat1 - rlat2;

        var a =
        Math.pow(Math.sin(dlat / 2), 2) +
        Math.cos(rlat1) * Math.cos(rlat2) * Math.pow(Math.sin(dlon / 2), 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return radius * c;
      },

      // Updates the existing modal pickup with locations with distances from the user
      updateLocationDistances: function updateLocationDistances(coords) {
        var unitSystem = this.$modal.find('[data-unit-system]').data('unit-system');
        var self = this;

        this.$modal.find('[data-distance="false"]').each(function () {
          var thisCoords = {
            latitude: parseFloat($(this).data('latitude')),
            longitude: parseFloat($(this).data('longitude')) };


          if (thisCoords.latitude && thisCoords.longitude) {
            var distance = self.functions.calculateDistance(
            coords, thisCoords, unitSystem).toFixed(1);

            $(this).html(distance);

            //Timeout to trigger animation
            setTimeout(() => {
              $(this).closest('.store-availability-list__location__distance').addClass('-in');
            }, 0);
          }

          $(this).attr('data-distance', 'true');
        });
      },

      // Requests the available stores and updates the page with info below Add to Basket, and append the modal to the page
      updateContent: function updateContent(variantId, productTitle, isSingleDefaultVariant, isVariantAvailable) {
        this.$container.off('click', '[data-store-availability-modal-open]');
        this.$container.off('click' + this.namespace, '.cc-popup-close, .cc-popup-background');
        $('.store-availabilities-modal').remove();

        if (!isVariantAvailable) {
          //If the variant is Unavailable (not the same as Out of Stock) - hide the store pickup completely
          this.$container.addClass(loadingClass);
          if (this.transitionDurationMS > 0) {
            this.$container.css('height', '0px');
          }
        } else {
          this.$container.addClass(loadingClass);
          if (this.transitionDurationMS > 0) {
            this.$container.css('height', this.$container.outerHeight() + 'px');
          }
        }

        if (isVariantAvailable) {
          this.functions.getAvailableStores.call(this, variantId, response => {
            if (response.trim().length > 0 && !response.includes('NO_PICKUP')) {
              this.$container.html(response);
              this.$container.html(this.$container.children().first().html()); // editor bug workaround

              this.$container.find('[data-store-availability-modal-product-title]').html(productTitle);

              if (isSingleDefaultVariant) {
                this.$container.find('.store-availabilities-modal__variant-title').remove();
              }

              this.$container.find('.cc-popup').appendTo('body');

              this.$modal = $('body').find('.store-availabilities-modal');
              var popup = new ccPopup(this.$modal, this.namespace);

              this.$container.on('click', '[data-store-availability-modal-open]', () => {
                popup.open();

                //When the modal is opened, try and get the users location
                this.functions.getUserLocation().then(coords => {
                  if (coords && this.$modal.find('[data-distance="false"]').length) {
                    //Re-retrieve the available stores location modal contents
                    this.functions.getAvailableStores.call(this, variantId, response => {
                      this.$modal.find('.store-availabilities-list').html($(response).find('.store-availabilities-list').html());
                      this.functions.updateLocationDistances.bind(this)(coords);
                    });
                  }
                });

                return false;
              });

              this.$modal.on('click' + this.namespace, '.cc-popup-close, .cc-popup-background', () => {
                popup.close();
              });

              this.$container.removeClass(loadingClass);

              if (this.transitionDurationMS > 0) {
                var newHeight = this.$container.find('.store-availability-container').outerHeight();
                this.$container.css('height', newHeight > 0 ? newHeight + 'px' : '');
                clearTimeout(this.removeFixedHeightTimeout);
                this.removeFixedHeightTimeout = setTimeout(() => {
                  this.$container.css('height', '');
                }, this.transitionDurationMS);
              }
            }
          });
        }
      } };


    // Initialise the section when it's instantiated
    this.onSectionLoad(container);
  };

  // Register section
  cc.sections.push({
    name: 'store-availability',
    section: theme.StoreAvailability });




  /*================ Icons ================*/
  theme.icons = {
    check: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon feather-check"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    chevronRight: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon feather-chevron-right"><polyline points="9 18 15 12 9 6"></polyline></svg>',
    arrowLeft: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon feather-arrow-left"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>',
    slideshowPrevArrow: '<button class="slick-prev"><svg fill="#000000" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>' + theme.strings.previous + '</title><path d="M0 0h24v24H0z" fill="none"/><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></button>',
    slideshowNextArrow: '<button class="slick-next"><svg fill="#000000" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>' + theme.strings.next + '</title><path d="M0 0h24v24H0z" fill="none"/><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg></button>' };


  /*================ Device ================*/
  theme.device = {
    cache: {
      isTouch: null },

    isTouch: () => {
      if (theme.device.cache.isTouch !== null) {
        return theme.device.cache.isTouch;
      } else {
        try {
          document.createEvent("TouchEvent");
          theme.device.cache.isTouch = true;
        } catch (e) {
          theme.device.cache.isTouch = false;
        } finally {
          return theme.device.cache.isTouch;
        }
      }
    } };


  /*================ Slate ================*/
  /**
   * A11y Helpers
   * -----------------------------------------------------------------------------
   * A collection of useful functions that help make your theme more accessible
   * to users with visual impairments.
   *
   *
   * @namespace a11y
   */

  slate.a11y = {

    /**
     * For use when focus shifts to a container rather than a link
     * eg for In-page links, after scroll, focus shifts to content area so that
     * next `tab` is where user expects if focusing a link, just $link.focus();
     *
     * @param {JQuery} $element - The element to be acted upon
     */
    pageLinkFocus: function pageLinkFocus($element) {
      var focusClass = 'js-focus-hidden';

      $element.first().
      attr('tabIndex', '-1').
      focus().
      addClass(focusClass).
      one('blur', callback);

      function callback() {
        $element.first().
        removeClass(focusClass).
        removeAttr('tabindex');
      }
    },

    /**
     * If there's a hash in the url, focus the appropriate element
     */
    focusHash: function focusHash() {
      var hash = window.location.hash;

      // is there a hash in the url? is it an element on the page?
      if (hash && document.getElementById(hash.slice(1))) {
        this.pageLinkFocus($(hash));
      }
    },

    /**
     * When an in-page (url w/hash) link is clicked, focus the appropriate element
     */
    bindInPageLinks: function bindInPageLinks() {
      $('a[href*=#]').on('click', function (evt) {
        this.pageLinkFocus($(evt.currentTarget.hash));
      }.bind(this));
    },

    /**
     * Traps the focus in a particular container
     *
     * @param {object} options - Options to be used
     * @param {jQuery} options.$container - Container to trap focus within
     * @param {jQuery} options.$elementToFocus - Element to be focused when focus leaves container
     * @param {string} options.namespace - Namespace used for new focus event handler
     */
    trapFocus: function trapFocus(options) {
      var eventName = options.namespace ?
      'focusin.' + options.namespace :
      'focusin';

      if (!options.$elementToFocus) {
        options.$elementToFocus = options.$container;
      }

      options.$container.attr('tabindex', '-1');
      options.$elementToFocus.focus();

      $(document).on(eventName, function (evt) {
        if (options.$container[0] !== evt.target && !options.$container.has(evt.target).length) {
          options.$container.focus();
        }
      });
    },

    /**
     * Removes the trap of focus in a particular container
     *
     * @param {object} options - Options to be used
     * @param {jQuery} options.$container - Container to trap focus within
     * @param {string} options.namespace - Namespace used for new focus event handler
     */
    removeTrapFocus: function removeTrapFocus(options) {
      var eventName = options.namespace ?
      'focusin.' + options.namespace :
      'focusin';

      if (options.$container && options.$container.length) {
        options.$container.removeAttr('tabindex');
      }

      $(document).off(eventName);
    } };

  ;
  /**
   * Cart Template Script
   * ------------------------------------------------------------------------------
   * A file that contains scripts highly couple code to the Cart template.
   *
   * @namespace cart
   */

  slate.cart = {

    /**
     * Browser cookies are required to use the cart. This function checks if
     * cookies are enabled in the browser.
     */
    cookiesEnabled: function cookiesEnabled() {
      var cookieEnabled = navigator.cookieEnabled;

      if (!cookieEnabled) {
        document.cookie = 'testcookie';
        cookieEnabled = document.cookie.indexOf('testcookie') !== -1;
      }
      return cookieEnabled;
    } };

  ;
  /**
   * Utility helpers
   * -----------------------------------------------------------------------------
   * A collection of useful functions for dealing with arrays and objects
   *
   * @namespace utils
   */

  slate.utils = {

    /**
     * Return an object from an array of objects that matches the provided key and value
     *
     * @param {array} array - Array of objects
     * @param {string} key - Key to match the value against
     * @param {string} value - Value to get match of
     */
    findInstance: function findInstance(array, key, value) {
      for (var i = 0; i < array.length; i++) {
        if (array[i][key] === value) {
          return array[i];
        }
      }
    },

    /**
     * Remove an object from an array of objects by matching the provided key and value
     *
     * @param {array} array - Array of objects
     * @param {string} key - Key to match the value against
     * @param {string} value - Value to get match of
     */
    removeInstance: function removeInstance(array, key, value) {
      var i = array.length;
      while (i--) {
        if (array[i][key] === value) {
          array.splice(i, 1);
          break;
        }
      }

      return array;
    },

    /**
     * _.compact from lodash
     * Remove empty/false items from array
     * Source: https://github.com/lodash/lodash/blob/master/compact.js
     *
     * @param {array} array
     */
    compact: function compact(array) {
      var index = -1;
      var length = array == null ? 0 : array.length;
      var resIndex = 0;
      var result = [];

      while (++index < length) {
        var value = array[index];
        if (value) {
          result[resIndex++] = value;
        }
      }
      return result;
    },

    /**
     * _.defaultTo from lodash
     * Checks `value` to determine whether a default value should be returned in
     * its place. The `defaultValue` is returned if `value` is `NaN`, `null`,
     * or `undefined`.
     * Source: https://github.com/lodash/lodash/blob/master/defaultTo.js
     *
     * @param {*} value - Value to check
     * @param {*} defaultValue - Default value
     * @returns {*} - Returns the resolved value
     */
    defaultTo: function defaultTo(value, defaultValue) {
      return value == null || value !== value ? defaultValue : value;
    } };

  ;
  /**
   * Rich Text Editor
   * -----------------------------------------------------------------------------
   * Wrap iframes and tables in div tags to force responsive/scrollable layout.
   *
   * @namespace rte
   */

  slate.rte = {
    /**
     * Wrap tables in a container div to make them scrollable when needed
     *
     * @param {object} options - Options to be used
     * @param {jquery} options.$tables - jquery object(s) of the table(s) to wrap
     * @param {string} options.tableWrapperClass - table wrapper class name
     */
    wrapTable: function wrapTable(options) {
      var tableWrapperClass = typeof options.tableWrapperClass === "undefined" ? '' : options.tableWrapperClass;

      options.$tables.wrap('<div class="' + tableWrapperClass + '"></div>');
    },

    /**
     * Wrap iframes in a container div to make them responsive
     *
     * @param {object} options - Options to be used
     * @param {jquery} options.$iframes - jquery object(s) of the iframe(s) to wrap
     * @param {string} options.iframeWrapperClass - class name used on the wrapping div
     */
    wrapIframe: function wrapIframe(options) {
      var iframeWrapperClass = typeof options.iframeWrapperClass === "undefined" ? '' : options.iframeWrapperClass;

      options.$iframes.each(function () {
        // Add wrapper to make video responsive
        $(this).wrap('<div class="' + iframeWrapperClass + '"></div>');

        // Re-set the src attribute on each iframe after page load
        // for Chrome's "incorrect iFrame content on 'back'" bug.
        // https://code.google.com/p/chromium/issues/detail?id=395791
        // Need to specifically target video and admin bar
        this.src = this.src;
      });
    } };

  ;
  /**
   * Image Helper Functions
   * -----------------------------------------------------------------------------
   * A collection of functions that help with basic image operations.
   *
   */

  slate.Image = function () {

    /**
     * Preloads an image in memory and uses the browsers cache to store it until needed.
     *
     * @param {Array} images - A list of image urls
     * @param {String} size - A shopify image size attribute
     */

    function preload(images, size) {
      if (typeof images === 'string') {
        images = [images];
      }

      for (var i = 0; i < images.length; i++) {
        var image = images[i];
        this.loadImage(this.getSizedImageUrl(image, size));
      }
    }

    /**
     * Loads and caches an image in the browsers cache.
     * @param {string} path - An image url
     */
    function loadImage(path) {
      new Image().src = path;
    }

    /**
     * Find the Shopify image attribute size
     *
     * @param {string} src
     * @returns {null}
     */
    function imageSize(src) {
      var match = src.match(/.+_((?:pico|icon|thumb|small|compact|medium|large|grande)|\d{1,4}x\d{0,4}|x\d{1,4})[_\.@]/);

      if (match) {
        return match[1];
      } else {
        return null;
      }
    }

    /**
     * Adds a Shopify size attribute to a URL
     *
     * @param src
     * @param size
     * @returns {*}
     */
    function getSizedImageUrl(src, size) {
      if (size === null) {
        return src;
      }

      if (size === 'master') {
        return this.removeProtocol(src);
      }

      var match = src.match(/\.(jpg|jpeg|gif|png|bmp|bitmap|tiff|tif)(\?v=\d+)?$/i);

      if (match) {
        var prefix = src.split(match[0]);
        var suffix = match[0];

        return this.removeProtocol(prefix[0] + '_' + size + suffix);
      } else {
        return null;
      }
    }

    function removeProtocol(path) {
      return path.replace(/http(s)?:/, '');
    }

    return {
      preload: preload,
      loadImage: loadImage,
      imageSize: imageSize,
      getSizedImageUrl: getSizedImageUrl,
      removeProtocol: removeProtocol };

  }();
  ;
  /**
   * Variant Selection scripts
   * ------------------------------------------------------------------------------
   *
   * Handles change events from the variant inputs in any `cart/add` forms that may
   * exist. Also updates the master select and triggers updates when the variants
   * price or image changes.
   *
   * @namespace variants
   */
  slate.Variants = function () {

    /**
     * Variant constructor
     *
     * @param {object} options - Settings from `product.js`
     */
    function Variants(options) {
      this.$container = options.$container;
      this.product = options.product;
      this.singleOptionSelector = options.singleOptionSelector;
      this.originalSelectorId = options.originalSelectorId;
      this.enableHistoryState = options.enableHistoryState;
      this.currentVariant = this._getVariantFromOptions();

      this._updateQtySelector(this.currentVariant);

      $(this.singleOptionSelector, this.$container).on('change', this._onSelectChange.bind(this));
    }

    Variants.prototype = $.extend({}, Variants.prototype, {

      /**
       * Get the currently selected options from add-to-cart form. Works with all
       * form input elements.
       *
       * @return {array} options - Values of currently selected variants
       */
      _getCurrentOptions: function _getCurrentOptions() {
        var currentOptions = $.map($(this.singleOptionSelector, this.$container), function (element) {
          var type = element.dataset.selectorType;
          var currentOption = {};

          if (type === 'listed') {
            var selectedOption = element.querySelector('input:checked');

            if (selectedOption) {
              currentOption.value = selectedOption.value;
              currentOption.index = element.dataset.index;

              return currentOption;
            } else {
              return false;
            }
          } else {
            var _selectedOption = element.querySelector('[aria-selected="true"]');

            if (_selectedOption) {
              currentOption.value = _selectedOption.dataset.value;
              currentOption.index = element.dataset.index;

              return currentOption;
            } else {
              return false;
            }
          }
        });

        return currentOptions;
      },

      /**
       * Find variant based on selected values.
       *
       * @param  {array} selectedValues - Values of variant inputs
       * @return {object || undefined} found - Variant object from product.variants
       */
      _getVariantFromOptions: function _getVariantFromOptions() {
        var selectedValues = this._getCurrentOptions();
        var variants = this.product.variants;
        var found = false;

        variants.forEach(function (variant) {
          var satisfied = true;

          selectedValues.forEach(function (option) {
            if (satisfied) {
              satisfied = option.value === variant[option.index];
            }
          });

          if (satisfied) {
            found = variant;
          }
        });

        return found || null;
      },

      /**
       * Get a variant option element.
       *
       * @param {object} variant - Currently selected variant
       * @returns {element}
       */
      _getVariantOptionElement: function _getVariantOptionElement(variant) {
        return this.$container.find('select[name="id"] option[value="' + variant.id + '"]');
      },

      /**
       * Event handler for when a variant input changes.
       */
      _onSelectChange: function _onSelectChange() {
        var variant = this._getVariantFromOptions();

        this.$container.trigger({
          type: 'variantChange',
          variant: variant });


        // this._updateSecondarySelects(variant);
        this._updateQtySelector(variant);

        if (!variant) {
          return;
        }

        $(window).trigger('cc-variant-updated', {
          variant: variant,
          product: this.product });


        this._updateMasterSelect(variant);
        this._updateImages(variant);
        this._updatePrice(variant);
        this.currentVariant = variant;

        if (this.enableHistoryState) {
          this._updateHistoryState(variant);
        }
      },

      /**
       * Trigger event when variant image changes
       *
       * @param  {object} variant - Currently selected variant
       * @return {event}  variantImageChange
       */
      _updateImages: function _updateImages(variant) {
        var variantMedia = variant.featured_media || {};
        var currentVariantMedia = this.currentVariant.featured_media || {};

        if (!variant.featured_media || variantMedia.id === currentVariantMedia.id) {
          return;
        }

        this.$container.trigger({
          type: 'variantImageChange',
          variant: variant });

      },

      /**
       * Trigger event when variant price changes.
       *
       * @param  {object} variant - Currently selected variant
       * @return {event} variantPriceChange
       */
      _updatePrice: function _updatePrice(variant) {
        var hasChanged = false;
        if (
        variant.price !== this.currentVariant.price ||
        variant.compare_at_price !== this.currentVariant.compare_at_price ||
        variant.unit_price_measurement !== this.currentVariant.unit_price_measurement ||

        variant.unit_price_measurement && (
        variant.unit_price !== this.currentVariant.unit_price ||
        variant.unit_price_measurement.reference_value !== this.currentVariant.unit_price_measurement.reference_value ||
        variant.unit_price_measurement.reference_unit !== this.currentVariant.unit_price_measurement.reference_unit))


        {
          hasChanged = true;
        }

        if (!hasChanged) {
          return;
        }

        this.$container.trigger({
          type: 'variantPriceChange',
          variant: variant });


        // Update the installments banner
        var input = this.$container[0].querySelector('input[name="id"]');
        input.value = variant.id;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },

      /**
       * Update quantity selector options according to inventory level
       *
       * @param {object} variant - Currently selected variant
       */
      _updateQtySelector: function _updateQtySelector(variant) {
        var section = this.$container[0];
        var qtySelector = section.querySelector('.qty-wrapper');

        if (!qtySelector) return;

        if (!variant || !variant.available) {
          this._resetQtySelector();
          qtySelector.classList.add('is-disabled');
          return;
        }

        var variantEl = this._getVariantOptionElement(variant);
        var invCount = Number(variantEl[0].dataset.inventory);
        var qytOptionEls = qtySelector.querySelectorAll('.cc-select__option');
        var dynamicOpts = theme.settings.dynamicQtyOpts && invCount && invCount > 0 && invCount < 10;

        if (dynamicOpts) {
          var currentyQty = qtySelector.querySelector('[aria-selected="true"]');

          if (Number(currentyQty.value) < invCount) {
            this._resetQtySelector();
          }
        }

        qytOptionEls.forEach((el, index) => {
          el.hidden = dynamicOpts && index + 1 > invCount;
        });

        qtySelector.classList.remove('is-disabled');
      },

      _resetQtySelector: function _resetQtySelector() {
        var section = this.$container[0];
        var btn = section.querySelector('.qty-wrapper .cc-select__btn');
        var listbox = section.querySelector('.qty-wrapper .cc-select__listbox');
        var firstOption = listbox.querySelector('.cc-select__option');
        var selectedOption = listbox.querySelector('[aria-selected="true"]');

        btn.firstChild.textContent = firstOption.firstElementChild.textContent;
        listbox.setAttribute('aria-activedescendant', firstOption.id);
        selectedOption.setAttribute('aria-selected', 'false');
        firstOption.setAttribute('aria-selected', 'true');
      },

      /**
       * Update history state for product deeplinking
       *
       * @param {object} variant - Currently selected variant
       */
      _updateHistoryState: function _updateHistoryState(variant) {
        if (!history.replaceState || !variant) {
          return;
        }

        var newurl = window.location.protocol + '//' + window.location.host + window.location.pathname + '?variant=' + variant.id;
        window.history.replaceState({ path: newurl }, '', newurl);
      },

      /**
       * Update hidden master select of variant change
       *
       * @param {object} variant - Currently selected variant
       */
      _updateMasterSelect: function _updateMasterSelect(variant) {
        var select = $(this.originalSelectorId, this.$container)[0];
        if (!select) return;

        select.value = variant.id;
        select.dispatchEvent(
        new Event('change', { bubbles: true, cancelable: false }));

      }

      /**
       * Update hidden secondary selects, e.g. Installments form
       *
       * @param {object} variant - Currently selected variant
       */
      //  _updateSecondarySelects: function _updateSecondarySelects(variant) {
      //   $(this.secondaryIdSelectors, this.$container).each(function(){
      //     this.value = variant ? variant.id : null;
      //     this.dispatchEvent(
      //       new Event('change', { bubbles: true, cancelable: false })
      //     );
      //   });
      // }
    });

    return Variants;
  }();
  ;

  /*=============== Components ===============*/
  theme.addNoticeToForm = function ($notice, $form) {
    var $existingNotices = $('.ajax-add-notice', $form);
    if ($existingNotices.length > 0) {
      setTimeout(function () {// wait until fading-out has definitely finished
        $existingNotices.replaceWith($notice.addClass('ajax-add-notice--pre-replace'));
        setTimeout(function () {
          $notice.removeClass('ajax-add-notice--pre-replace');
        }, 10);
      }, 251);
    } else {
      $notice.addClass('ajax-add-notice--pre-reveal').appendTo($form).slideDown(250, function () {
        $(this).removeClass('ajax-add-notice--pre-reveal');
      });
    }
  };

  $(document).on('submit', 'form.product-form[data-ajax-add="true"]', function (e) {
    var $form = $(this);

    // Force page reload if product added to cart from a section on the cart page
    if (document.body.classList.contains('template-cart')) {
      $form.attr('data-ajax-add', false);
      $form.submit();
      return;
    }

    // Disable add button
    $form.find(':submit').attr('disabled', 'disabled').each(function () {
      var contentFunc = $(this).is('button') ? 'html' : 'val';
      $(this).data('previous-value', $(this)[contentFunc]())[contentFunc](theme.strings.addingToCart);
    });

    // Hide any notices
    $('.ajax-add-notice', $form).css('opacity', 0);

    // Add to cart
    $.post(theme.routes.cart_add_url + '.js', $form.serialize(), function (itemData) {

      // Enable add button
      var $btn = $form.find(':submit').each(function () {
        var $btn = $(this);
        var contentFunc = $(this).is('button') ? 'html' : 'val';
        // Revert to normal
        $btn.removeAttr('disabled')[contentFunc]($btn.data('previous-value'));
      }).first();


      // reload header
      $.get(theme.routes.search_url, function (data) {
        var selectors = [
        '.page-header .cart'];

        var $parsed = $($.parseHTML('<div>' + data + '</div>'));
        for (var i = 0; i < selectors.length; i++) {
          var cartSummarySelector = selectors[i];
          var $newCartObj = $parsed.find(cartSummarySelector).clone();
          var $currCart = $(cartSummarySelector);
          $currCart.replaceWith($newCartObj);
        }
      });

      // display added notice
      var $template = $([
      '<div class="ajax-add-notice ajax-add-notice--added global-border-radius">',
      '<div class="ajax-add-notice__inner">',
      '<div class="ajax-add-notice__item">',
      '<span class="feather-icon">', theme.icons.check, '</span>',
      theme.strings.addedToCart,
      '</div>',
      '<div class="ajax-add-notice__go">',
      '<a href="', theme.routes.cart_url, '">',
      theme.strings.goToCart,
      '<span class="feather-icon feather-icon--small">', theme.icons.chevronRight, '</span>',
      '</a>',
      '</div>',
      '</div>',
      '</div>'].
      join(''));

      theme.addNoticeToForm($template, $form);

    }, 'json').fail(function (data) {
      // Enable add button
      var $firstBtn = $form.find(':submit').removeAttr('disabled').each(function () {
        var $btn = $(this);
        var contentFunc = $btn.is('button') ? 'html' : 'val';
        $btn[contentFunc]($btn.data('previous-value'));
      }).first();

      // Not added, show message
      if (typeof data != 'undefined' && typeof data.status != 'undefined') {
        var jsonRes = $.parseJSON(data.responseText);
        var $template = $([
        '<div class="ajax-add-notice ajax-add-notice--error global-border-radius">',
        '<div class="ajax-add-notice__inner">',
        jsonRes.description,
        '</div>',
        '</div>'].
        join(''));
        theme.addNoticeToForm($template, $form);
      } else {
        // Some unknown error? Disable ajax and submit the old-fashioned way.
        $form.attr('data-ajax-add', false);
        $form.submit();
      }
    });
    return false;
  });
  ;
  /* Product Media
   *
   * Load and destroy:
   * theme.ProductMedia.init(galleryContainer, {
   *   onModelViewerPlay: function(e){
   *     $(e.target).closest('.slick-slider').slick('slickSetOption', 'swipe', false);
   *   },
   *   onModelViewerPause: function(e){
   *     $(e.target).closest('.slick-slider').slick('slickSetOption', 'swipe', true);
   *   },
   *   onPlyrPlay: function(e){
   *     $(e.target).closest('.slick-slider').slick('slickSetOption', 'swipe', false);
   *   },
   *   onPlyrPause: function(e){
   *     $(e.target).closest('.slick-slider').slick('slickSetOption', 'swipe', true);
   *   },
   * });
   *
   * theme.ProductMedia.destroy(galleryContainer);
   *
   * Trigger mediaVisible and mediaHidden events based on UI
   * $slickSlideshow.on('afterChange', function(evt, slick, current){
   *   $('.product-media--activated').removeClass('product-media--activated').trigger('mediaHidden');
   *   $('.product-media', slick.$slides[current]).addClass('product-media--activated').trigger('mediaVisible');
   * });
   */
  theme.ProductMedia = new function () {
    var _ = this;

    _._setupShopifyXr = function () {
      if (!window.ShopifyXR) {
        document.addEventListener('shopify_xr_initialized', _._setupShopifyXr.bind(this));
        return;
      }
      document.removeEventListener('shopify_xr_initialized', _._setupShopifyXr);

      window.ShopifyXR.addModels(JSON.parse($(this).html()));
      window.ShopifyXR.setupXRElements();
    };

    this.init = function (container, settings) {
      var settings = settings || {},
      _container = container;

      /// First, set up events/callbacks

      // when any media appears
      $(container).on('mediaVisible', '.product-media--video-loaded, .product-media--model-loaded', function () {
        // autoplay all media on larger screens
        if ($(window).width() >= 768) {
          $(this).data('player').play();
        }
        // update view-in-space
        if ($(this).hasClass('product-media--model')) {
          $('.view-in-space', _container).attr('data-shopify-model3d-id', $(this).data('model-id'));
        }
      });

      // when any media is hidden
      $(container).on('mediaHidden', '.product-media--video-loaded, .product-media--model-loaded', function () {
        // pause all media
        $(this).data('player').pause();
      });

      // necessary callbacks
      if (settings.onVideoVisible) {
        $(container).on('mediaVisible', '.product-media--video-loaded', settings.onVideoVisible);
      }

      if (settings.onVideoHidden) {
        $(container).on('mediaHidden', '.product-media--video-loaded', settings.onVideoHidden);
      }

      $('model-viewer', container).each(function () {
        if (settings.onModelViewerPlay) {
          $(this).on('shopify_model_viewer_ui_toggle_play', settings.onModelViewerPlay);
        }
        if (settings.onModelViewerPause) {
          $(this).on('shopify_model_viewer_ui_toggle_pause', settings.onModelViewerPause);
        }
      });

      /// Second, initialise media

      var $firstMedia = $(container).find('.product-media:first');
      var _autoplayOnceIfRequested = function _autoplayOnceIfRequested($currentMedia) {
        return $firstMedia[0] == $currentMedia[0] && settings.autoplayFirstMedia;
      };

      // set up video media elements with a controller
      $(container).find('.product-media--video').each(function (index) {
        var enableLooping = $(this).data('enable-video-looping'),
        element = $(this).find('iframe, video')[0],
        $currentMedia = $(this);
        if (element.tagName === 'VIDEO') {
          // set up a controller for Plyr video
          window.Shopify.loadFeatures([
          {
            name: 'video-ui',
            version: '1.0',
            onLoad: function () {
              var playerObj = { playerType: 'html5', element: element };

              playerObj.play = function () {
                this.plyr.play();
              }.bind(playerObj);

              playerObj.pause = function () {
                this.plyr.pause();
              }.bind(playerObj);

              playerObj.destroy = function () {
                this.plyr.destroy();
              }.bind(playerObj);

              playerObj.plyr = new Shopify.Plyr(element, {
                controls: [
                'play',
                'progress',
                'mute',
                'volume',
                'play-large',
                'fullscreen'],

                autoplay: _autoplayOnceIfRequested($currentMedia),
                loop: { active: enableLooping },
                hideControlsOnPause: true,
                iconUrl: '//cdn.shopify.com/shopifycloud/shopify-plyr/v1.0/shopify-plyr.svg',
                tooltips: { controls: false, seek: true } });

              $(this).data('player', playerObj).addClass('product-media--video-loaded');

              // callbacks for Plyr playback
              $(element).on('playing', function () {
                // pause other media
                $('.product-media').not($currentMedia).trigger('mediaHidden');
                // prevent bubbling inputs that can be used by carousels
                $currentMedia.find('.plyr__controls').off('.themeMediaEventFix').
                on('keydown.themeMediaEventFix touchstart.themeMediaEventFix mousedown.themeMediaEventFix', function (e) {
                  e.stopPropagation();
                });
                if (typeof callbacks !== 'undefined' && callbacks.onPlyrPlay) {
                  callbacks.onPlyrPlay(playerObj);
                }
              });
              $(element).on('pause ended', function () {
                // remove event bubbling interceptor
                $currentMedia.find('.plyr__controls').off('.themeMediaEventFix');
                if (typeof callbacks !== 'undefined' && callbacks.onPlyrPause) {
                  callbacks.onPlyrPause(playerObj);
                }
              });
              if (settings.onPlyrInit) {
                settings.onPlyrInit(playerObj);
              }
            }.bind(this) }]);


          theme.loadStyleOnce('https://cdn.shopify.com/shopifycloud/shopify-plyr/v1.0/shopify-plyr.css');

        } else if (element.tagName === 'IFRAME') {
          if (
          /^(https?:\/\/)?(www\.)?(youtube\.com|youtube-nocookie\.com|youtu\.?be)\/.+$/.test(
          element.src))

          {
            // set up a controller for YouTube video
            var existingYTCB = window.onYouTubeIframeAPIReady;
            var loadYoutubeVideo = function () {
              var playerObj = { playerType: 'youtube', element: element };
              var videoId = $(this).data('video-id');

              playerObj.player = new YT.Player(element, {
                videoId: videoId,
                playerVars: {
                  autoplay: _autoplayOnceIfRequested($currentMedia) ? 1 : 0,
                  origin: window.location.origin },

                events: {
                  onReady: function onReady(event) {
                    if (_autoplayOnceIfRequested($currentMedia)) {
                      event.target.playVideo();
                    }
                  },
                  onStateChange: function onStateChange(event) {
                    if (event.data === YT.PlayerState.ENDED && enableLooping) {
                      event.target.seekTo(0);
                    }
                  } } });



              playerObj.play = function () {
                try {
                  this.player.playVideo();
                } catch (ex) {}
              }.bind(playerObj);

              playerObj.pause = function () {
                try {
                  this.player.pauseVideo();
                } catch (ex) {}
              }.bind(playerObj);

              playerObj.destroy = function () {
                try {
                  // ytapi removes iframe, so restore manually
                  var frameHtml = $(this.element)[0].outerHTML,
                  $parent = $(this.element).parent();
                  this.player.destroy();
                  $parent.append(frameHtml);
                } catch (ex) {}
              }.bind(playerObj);

              $(this).data('player', playerObj).addClass('product-media--video-loaded');

              if (settings.onYouTubeInit) {
                settings.onYouTubeInit(playerObj);
              }
            }.bind(this);

            if (window.YT && window.YT.Player) {
              loadYoutubeVideo();
            } else {
              window.onYouTubeIframeAPIReady = function () {
                if (existingYTCB) {
                  existingYTCB();
                }
                loadYoutubeVideo();
              };
              theme.loadScriptOnce('https://www.youtube.com/iframe_api');
            }
          }
        }
      });

      // set up a 3d model when it first appears
      $(container).on('mediaVisible mediaVisibleInitial', '.product-media--model:not(.product-media--model-loaded):not(.product-media--model-loading)', function (e) {
        var element = $(this).find('model-viewer')[0],
        autoplay = e.type != 'mediaVisibleInitial' || _autoplayOnceIfRequested($(this));
        // do not run this twice
        $(this).addClass('product-media--model-loading');
        // load viewer
        theme.loadStyleOnce('https://cdn.shopify.com/shopifycloud/model-viewer-ui/assets/v1.0/model-viewer-ui.css');
        window.Shopify.loadFeatures([
        {
          name: 'model-viewer-ui',
          version: '1.0',
          onLoad: function () {
            $(this).data('player', new Shopify.ModelViewerUI(element));
            // add mouseup event proxy to fix carousel swipe gestures
            $('<div class="theme-event-proxy">').on('mouseup', function (e) {
              e.stopPropagation();
              e.preventDefault();
              var newEventTarget = $(e.currentTarget).closest('.product-media')[0];
              newEventTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            }).appendTo(
            $(this).find('.shopify-model-viewer-ui__controls-overlay'));

            // when playing or loading, prevent bubbling of mouse/touch start
            $(this).find('model-viewer').on('shopify_model_viewer_ui_toggle_play', function () {
              $(this).closest('.product-media').on('touchstart.themeModelViewerFix mousedown.themeModelViewerFix', function (e) {
                e.stopPropagation();
              });
            }).on('shopify_model_viewer_ui_toggle_pause', function () {
              $(this).closest('.product-media').off('.themeModelViewerFix');
            });
            // set class and re-trigger visible event now loaded
            $(this).addClass('product-media--model-loaded').removeClass('product-media--model-loading');
            if (settings.onModelViewerInit) {
              settings.onModelViewerInit(element);
            }
            if (autoplay) {
              $(this).trigger('mediaVisible');
            }
          }.bind(this) }]);


      });

      // Third, load AR viewer
      if ($('.model-json', container).length) {
        window.Shopify.loadFeatures([
        {
          name: 'shopify-xr',
          version: '1.0',
          onLoad: _._setupShopifyXr.bind($('.model-json', container)) }]);



        // pause video when a 3d model is launched in AR
        $(document).on('shopify_xr_launch', function () {
          $('.product-media--video-loaded').each(function () {
            $(this).data('player').pause();
          });
        });
      }

      // 3d model in first place - start in paused mode
      setTimeout(function () {
        $('.product-media:first', this).filter('.product-media--model').trigger('mediaVisibleInitial');
      }.bind(container), 50);
    };

    this.destroy = function (container) {
      $(document).off('shopify_xr_launch');
      $(container).off('mediaVisible mediaVisibleInitial mediaHidden');
      $('.product-media--video-loaded, .product-media--model-loaded', container).each(function () {
        $(this).data('player').destroy();
      }).removeClass('product-media--video-loaded product-media--model-loaded');
      $('.product-media--video video', container).off('playing pause ended');
      $('model-viewer', container).off('shopify_model_viewer_ui_toggle_play shopify_model_viewer_ui_toggle_pause');
      $('.product-media--model .theme-event-proxy').off('mouseup').remove();
    };
  }();


  /*================ Sections ================*/
  /**
   * Sidebar section Script
   * ------------------------------------------------------------------------------
   *
     * @namespace sidebar
   */

  theme.Sidebar = new function () {
    this.onSectionLoad = function (container) {
      this.$container = $(container);
      this.namespace = theme.namespaceFromSection(container);

      // check sidebar exists
      this.sidebarExists = !!$('.sidebar', container).length;
      $('.template-index').toggleClass('page-has-sidebar', this.sidebarExists);
    };
  }();
  ;
  /**
   * Product Template Script
   * ------------------------------------------------------------------------------
   * A file that contains scripts highly couple code to the Product template.
   *
     * @namespace product
   */

  theme.Product = new function () {

    var selectors = {
      addToCart: '[data-add-to-cart]',
      addToCartText: '[data-add-to-cart-text]',
      comparePrice: '[data-compare-price]',
      comparePriceText: '[data-compare-text]',
      originalSelectorId: '[data-product-select]',
      priceWrapper: '[data-price-wrapper]',
      productFeaturedMedia: '[data-product-featured-media]',
      productFeaturedMediaWithGallery: '[data-product-featured-media]:not(.product-image--no-gallery) .product-image__link, .product-thumbnails.slick-slider .product-image__link',
      productThumbnailForCarouselContainer: '.product-thumbnails--inline',
      productThumbnailImage: '.product-thumbnails__link, .carousel-media .product-image__link',
      productJson: '[data-product-json]',
      productPrice: '[data-product-price]',
      zoomValidThumbs: '.product-thumbnails--desktop .product-thumbnails__item-media-image [data-product-single-thumbnail]',
      singleOptionSelector: '[data-single-option-selector]',
      skuWrapper: '.product-sku',
      sku: '.product-sku__value',
      unitPrice: '.unit-price',
      storeAvailability: '[data-store-availability-container]',
      inventoryNotice: '.product-inventory-notice',
      variantSelector: '.variant-selector' };


    this.onSectionLoad = function (container) {
      this.$container = $(container);

      /// Init store availability if applicable
      if ($(selectors.storeAvailability, container).length) {
        this.storeAvailability = new theme.StoreAvailability($(selectors.storeAvailability, container)[0]);
      }

      // Stop parsing if we don't have the product json script tag when loading
      // section in the Theme Editor
      if (!$(selectors.productJson, this.$container).html()) {
        return;
      }

      var sectionId = this.$container.attr('data-section-id');
      this.productSingleObject = JSON.parse($(selectors.productJson, this.$container).html());

      var options = {
        $container: this.$container,
        enableHistoryState: this.$container.data('enable-history-state') || false,
        singleOptionSelector: selectors.singleOptionSelector,
        originalSelectorId: selectors.originalSelectorId,
        product: this.productSingleObject };


      this.settings = {};
      this.namespace = '.product';
      this.variants = new slate.Variants(options);
      this.$featuredImage = $(selectors.productFeaturedMedia, this.$container);
      this.$zoomValidThumbs = $(selectors.zoomValidThumbs, this.$container);

      this.$container.on('variantChange' + this.namespace, this.functions.updateAddToCartState.bind(this));
      this.$container.on('variantPriceChange' + this.namespace, this.functions.updateProductPrices.bind(this));

      if (this.$container.find(selectors.skuWrapper)) {
        this.$container.on('variantChange' + this.namespace, this.functions.updateSKU.bind(this));
      }

      if (this.$container.find(selectors.inventoryNotice)) {
        this.$container.on('variantChange' + this.namespace, this.functions.updateInventoryNotice.bind(this));
      }

      if (this.$featuredImage.length > 0) {
        this.$container.on('variantImageChange' + this.namespace, this.functions.updateProductImage.bind(this));
      }

      this.$thumbnails = $(selectors.productThumbnailImage, container);
      if (this.$thumbnails.length > 0) {
        this.$container.on('click' + this.namespace + ' pseudoclick' + this.namespace, selectors.productThumbnailImage, this.functions.selectThumbnailImage.bind(this));
      }

      // image zoom
      this.$container.on('click' + this.namespace, selectors.productFeaturedMediaWithGallery, this.functions.openGallery.bind(this));

      // image media
      theme.ProductMedia.init(this.$container);

      theme.initVariantSelectors($(selectors.singleOptionSelector, container), options.product);

      if (this.variants.product.variants.length > 1) {
        // emit an event to broadcast the variant update
        $(window).trigger('cc-variant-updated', {
          variant: this.variants.currentVariant,
          product: this.productSingleObject });

      }

      if (this.$thumbnails.length > 0) {
        // mobile carousel
        this.$thumbnailForCarouselContainer = $(selectors.productThumbnailForCarouselContainer, container);
        this.functions.assessMobileCarousel.bind(this)();
        $(window).on('debouncedresize' + this.namespace, this.functions.assessMobileCarousel.bind(this));

        // reveal thumbnails now - avoiding lazysizes + slick conflict
        this.$thumbnails.find('.lazyload--manual').removeClass('lazyload--manual').addClass('lazyload');
      }

      // note: adds event to window
      theme.initProductTitleAlignmentWatcher(this.$container, this.namespace);

      // click review rating under title
      $('.cc-rating-container', container).on('click', function () {
        $('html,body').animate({
          scrollTop: $($(this).attr('href')).offset().top },
        1000);
        return false;
      });
    };

    this.functions = {

      /**
       * Switches thumbnails into a carousel on mobile
       */
      assessMobileCarousel: function assessMobileCarousel() {
        // test by checking if single image is visible
        if (!this.$featuredImage.is(':visible')) {
          if (!this.$thumbnailForCarouselContainer.hasClass('slick-slider')) {
            this.$thumbnailForCarouselContainer.addClass('slick-slider');

            theme.ProductMedia.destroy(this.$container); // destroy existing media

            this.$thumbnailForCarouselContainer.slick({
              autoplay: false,
              fade: false,
              infinite: false,
              useTransform: true,
              dots: true,
              arrows: true,
              prevArrow: theme.icons.slideshowPrevArrow,
              nextArrow: theme.icons.slideshowNextArrow,
              appendArrows: $('.slick-external-controls .slick-external-arrows', this.$container),
              appendDots: $('.slick-external-controls .slick-external-dots', this.$container),
              adaptiveHeight: true,
              initialSlide: $('.product-thumbnails__item--active', this.$thumbnailForCarouselContainer).index() || 0 });

            // create carousel media
            this.$thumbnailForCarouselContainer.find('.product-thumbnails__item').each(function () {
              $('<div class="carousel-media">').append(
              $(this).find('.thumbnail-media-template').html()).
              prependTo(this);
            });
            theme.ProductMedia.init(this.$container, {
              onPlyrPlay: function onPlyrPlay(evt) {
                $(evt.target).closest('.product-media').
                find('.plyr__controls').
                off('.themeModelViewerFix').
                on('touchstart.themeModelViewerFix touchmove.themeModelViewerFix touchend.themeModelViewerFix mousedown.themeModelViewerFix mousemove.themeModelViewerFix mouseup.themeModelViewerFix', function (e) {
                  e.stopPropagation();
                });
              } });

            this.$thumbnailForCarouselContainer.find('.product-media').trigger('mediaVisibleInitial');
            this.$thumbnailForCarouselContainer.on('afterChange', function (evt, slick, current) {
              // notify media of visibility
              var $currentMedia = $('.product-media', slick.$slides[current]);
              $('.product-media').not($currentMedia).trigger('mediaHidden');
              $currentMedia.trigger('mediaVisible');
              // fix tabbing
              theme.productGallerySlideshowTabFix(slick.$slides, current);
            });
          }
        } else {
          if (this.$thumbnailForCarouselContainer.hasClass('slick-slider')) {
            // remove carousel media
            theme.ProductMedia.destroy(this.$container);
            this.$thumbnailForCarouselContainer.find('.carousel-media').remove();

            this.$thumbnailForCarouselContainer.slick('unslick').off('afterChange');
            this.$thumbnailForCarouselContainer.removeClass('slick-slider');
            theme.ProductMedia.init(this.$container); // init original large media
            this.$thumbnailForCarouselContainer.find('.product-media').trigger('mediaVisibleInitial');
          }
        }
      },

      /**
       * Updates the DOM state of the add to cart button
       *
       * @param {boolean} enabled - Decides whether cart is enabled or disabled
       * @param {string} text - Updates the text notification content of the cart
       */
      updateAddToCartState: function updateAddToCartState(evt) {
        var variant = evt.variant;

        if (variant) {
          $(selectors.priceWrapper, this.$container).removeClass('product-price--unavailable');
        } else {
          $(selectors.addToCart, this.$container).prop('disabled', true);
          $(selectors.addToCartText, this.$container).html(theme.strings.unavailable);
          $(selectors.priceWrapper, this.$container).addClass('product-price--unavailable');
          return;
        }

        if (variant.available) {
          $(selectors.addToCart, this.$container).prop('disabled', false);
          $(selectors.addToCartText, this.$container).html(theme.strings.addToCart);
        } else {
          $(selectors.addToCart, this.$container).prop('disabled', true);
          $(selectors.addToCartText, this.$container).html(theme.strings.soldOut);
        }

        // backorder
        var $backorderContainer = $('.backorder', this.$container);
        if ($backorderContainer.length) {
          if (variant && variant.available) {
            var $option = $(selectors.originalSelectorId + ' option[value="' + variant.id + '"]', this.$container);
            if (variant.inventory_management && $option.data('stock') == 'out') {
              $backorderContainer.find('.backorder__variant').html(this.productSingleObject.title + (variant.title.indexOf('Default') >= 0 ? '' : ' - ' + variant.title));
              $backorderContainer.show();
            } else {
              $backorderContainer.hide();
            }
          } else {
            $backorderContainer.hide();
          }
        }
      },

      /**
       * Get the display unit for unit pricing
       */
      _getBaseUnit: function _getBaseUnit(variant) {
        return variant.unit_price_measurement.reference_value === 1 ?
        variant.unit_price_measurement.reference_unit :
        variant.unit_price_measurement.reference_value +
        variant.unit_price_measurement.reference_unit;
      },

      /**
       * Updates the DOM with specified prices
       *
       * @param {string} productPrice - The current price of the product
       * @param {string} comparePrice - The original price of the product
       */
      updateProductPrices: function updateProductPrices(evt) {
        var variant = evt.variant;
        var $comparePrice = $(selectors.comparePrice, this.$container);
        var $compareEls = $comparePrice.add(selectors.comparePriceText, this.$container);
        var $price = $(selectors.productPrice, this.$container);
        var $unitPrice = $(selectors.unitPrice, this.$container);

        $price.html('<span class="theme-money">' + theme.Shopify.formatMoney(variant.price, theme.moneyFormatWithCodePreference) + '</span>');

        if (variant.compare_at_price > variant.price) {
          $comparePrice.html('<span class="theme-money">' + theme.Shopify.formatMoney(variant.compare_at_price, theme.moneyFormatWithCodePreference) + '</span>');
          $compareEls.removeClass('hide');
          $price.addClass('product-price__reduced');
        } else {
          $comparePrice.html('');
          $compareEls.addClass('hide');
          $price.removeClass('product-price__reduced');
        }

        if (variant.unit_price_measurement) {
          var $newUnitPriceArea = $('<div class="unit-price small-text">');
          $('<span class="unit-price__price theme-money">').html(theme.Shopify.formatMoney(variant.unit_price, theme.moneyFormat)).appendTo($newUnitPriceArea);
          $('<span class="unit-price__separator">').html(theme.strings.unitPriceSeparator).appendTo($newUnitPriceArea);
          $('<span class="unit-price__unit">').html(this.functions._getBaseUnit(variant)).appendTo($newUnitPriceArea);
          if ($unitPrice.length) {
            $unitPrice.replaceWith($newUnitPriceArea);
          } else {
            $(selectors.priceWrapper, this.$container).append($newUnitPriceArea);
          }
        } else {
          $unitPrice.remove();
        }
      },

      /**
       * Updates the SKU
       */
      updateSKU: function updateSKU(evt) {
        var variant = evt.variant;

        if (variant && variant.sku) {
          $(selectors.skuWrapper, this.$container).removeClass('product-sku--empty');
          $(selectors.sku, this.$container).html(variant.sku);
        } else {
          $(selectors.skuWrapper, this.$container).addClass('product-sku--empty');
          $(selectors.sku, this.$container).empty();
        }
      },

      _getVariantOptionElement: function _getVariantOptionElement(variant) {
        return $(selectors.variantSelector, this.$container).find('option[value="' + variant.id + '"]');
      },

      /**
       * Updates the Inventory Notice
       */
      updateInventoryNotice: function updateInventoryNotice(evt) {
        var variant = evt.variant;
        if (variant) {
          var inventoryData = this.functions._getVariantOptionElement(variant).data('inventory');
          if (inventoryData && inventoryData > 0) {
            $(selectors.inventoryNotice, this.$container).removeClass('product-inventory-notice--no-inventory').html(theme.strings.inventoryNotice.replace('[[ quantity ]]', inventoryData));
          } else {
            $(selectors.inventoryNotice, this.$container).addClass('product-inventory-notice--no-inventory').empty();
          }
        } else {
          $(selectors.inventoryNotice, this.$container).addClass('product-inventory-notice--no-inventory').empty();
        }
      },

      /**
       * Display selected thumbnail
       */
      selectThumbnailImage: function selectThumbnailImage(evt) {
        var $thumbnailContainer = $(evt.currentTarget).parent();
        if (!$thumbnailContainer.hasClass('product-thumbnails__item--active')) {
          // if a carousel exists
          if (this.$thumbnailForCarouselContainer.hasClass('slick-slider')) {
            if ($thumbnailContainer.hasClass('carousel-media')) {
              // selected actual slide - do nothing
            } else {
              // hidden thumbnail, e.g. variant image change
              var mediaId = $thumbnailContainer.find('[data-thumbnail-media-id]').data('thumbnail-media-id');
              var slickIndex = this.$thumbnailForCarouselContainer.find('[data-thumbnail-media-id="' + mediaId + '"]').closest('.slick-slide').data('slick-index');
              this.$thumbnailForCarouselContainer.slick('slickGoTo', slickIndex);

              $thumbnailContainer.
              addClass('product-thumbnails__item--active').
              siblings('.product-thumbnails__item--active').
              removeClass('product-thumbnails__item--active');
            }
          } else {
            // with thumbnails
            theme.ProductMedia.destroy(this.$container);
            this.$featuredImage.html(
            $(evt.currentTarget).find('.thumbnail-media-template').html());

            // load media and play immediately
            theme.ProductMedia.init(this.$container, {
              autoplayFirstMedia: true });


            $thumbnailContainer.
            addClass('product-thumbnails__item--active').
            siblings('.product-thumbnails__item--active').
            removeClass('product-thumbnails__item--active');
          }
        }
        evt.preventDefault();
      },

      /**
       * Updates the DOM with the specified image URL
       */
      updateProductImage: function updateProductImage(evt) {
        var variant = evt.variant;
        if (variant.featured_media) {
          this.$container.find('[data-thumbnail-media-id="' + variant.featured_media.id + '"]').trigger('pseudoclick');
        }
      },

      /**
       * Show gallery of all product images
       */
      openGallery: function openGallery(evt) {
        evt.preventDefault();

        var pswpElement = document.querySelectorAll('.pswp')[0];

        var items = [];
        if (this.$zoomValidThumbs.length) {
          var useSlideshowImg = !this.$zoomValidThumbs.is(':visible');
          this.$zoomValidThumbs.each(function () {
            var item = {
              src: $(this).attr('href'),
              w: $(this).data('image-w'),
              h: $(this).data('image-h') };

            var img;
            if (useSlideshowImg) {
              img = $('.product-image__link[href="' + $(this).attr('href') + '"]:visible img')[0];
            } else {
              img = $(this).find('img')[0];
            }
            if (img && typeof img.currentSrc !== 'undefined') {
              item.msrc = img.currentSrc;
            }
            items.push(item);
          });
        } else {
          var item = {
            src: this.$featuredImage.find('a').attr('href'),
            w: this.$featuredImage.data('image-w'),
            h: this.$featuredImage.data('image-h') };

          var img = this.$featuredImage.find('img')[0];
          if (typeof img.currentSrc !== 'undefined') {
            item.msrc = img.currentSrc;
          }
          items.push(item);
        }

        var index = 0;
        var $activeThumb = this.$container.find('.product-thumbnails__item--active:not(.slick-slide):visible .product-thumbnails__link, .product-thumbnails__item-media-image.slick-current:visible .product-thumbnails__link');
        if ($activeThumb.length) {
          var activeHref = $activeThumb.attr('href');
          for (var i = 0; i < items.length; i++) {
            if (items[i].src == activeHref) {
              index = i;
              break;
            }
          }
        }

        var options = {
          index: index,
          history: false,
          captionEl: false,
          shareEl: false,
          fullscreenEl: false,
          getThumbBoundsFn: function (imageIndex) {
            var thumbnail = false;
            var hrefToFind = items[imageIndex].src;

            // first check - main image on desktop
            if (this.$featuredImage.find('.product-image__link:visible').attr('href') == hrefToFind) {
              thumbnail = this.$featuredImage.find('.product-image__link img')[0];
            } else {
              // second check - thumbnails & slideshow
              var $thumb = this.$container.find('.product-thumbnails__link, .product-image__link').filter(function () {
                return $(this).attr('href') == hrefToFind;
              }).filter(':visible');
              if ($thumb.length) {
                thumbnail = $thumb.find('img')[0];
              }
            }

            // backup to avoid js error
            if (!thumbnail) {
              thumbnail = this.$featuredImage.find('img')[0];
            }

            var pageYScroll = window.pageYOffset || document.documentElement.scrollTop,
            rect = thumbnail.getBoundingClientRect();

            return { x: rect.left, y: rect.top + pageYScroll, w: rect.width };
          }.bind(this) };


        // Initializes and opens PhotoSwipe
        this.imageGallery = new PhotoSwipe(pswpElement, PhotoSwipeUI_Default, items, options);
        this.imageGallery.init();
        this.imageGallery.listen('destroy', function () {
          this.imageGallery = null;
        }.bind(this));
      } };


    this.onSectionUnload = function (container) {
      this.$container.off(this.namespace);
      $(window).off(this.namespace);
      if (this.imageGallery) {
        this.imageGallery.close();
      }
      if (this.$thumbnailForCarouselContainer) {
        this.$thumbnailForCarouselContainer.filter('.slick-slider').slick('unslick').off('afterChange');
      }
      if (this.storeAvailability) {
        this.storeAvailability.onSectionUnload();
      }
      theme.ProductMedia.destroy(this.$container);
      $('cc-rating-container', container).off('click');
    };
  }();
  ;
  /**
   * Header Script
   * ------------------------------------------------------------------------------
   *
   * @namespace Header
   */

  theme.Header = new function () {
    this.onSectionLoad = function (container) {
      this.$container = $(container);
      this.namespace = theme.namespaceFromSection(container);
      this.mobileMenuTransitionTime = 500;

      this.$searchBar = $('.search-bar', container);
      this.$newsletterSignupButton = $('.js-header-newsletter-open', this.$container);
      this.$searchInput = $('.search-form__input');

      /**
       * Making search bar un-tabbable on page load
       */
      $('.header-search-form', this.$container).find('a, button, input').attr('tabindex', '-1');

      /**
       * Toggle header search bar open
       */
      $('.js-header-search-trigger', this.$container).on('click' + this.namespace, function (e) {
        e.preventDefault();
        $('body').toggleClass('show-search');
        $('.header-search-form', this.$container).find('a, button, input').removeAttr('tabindex');
        $('.header-search-form .search-form__input', this.$container).focus();
      }.bind(this));

      /**
       * Fetch search results for entered text
       */
      $('.search-form__input[data-live-search="true"]', this.$container).on('change' + this.namespace + ' keyup' + this.namespace + ' paste' + this.namespace, function (e) {
        this.functions.fetchSearchResults.bind(this)(e);
      }.bind(this));

      // mobile menu events
      $(this.$container).on('click' + this.namespace, '.js-mobile-menu-icon', this.functions.mobileMenuOpen.bind(this));
      $(this.$container).on('click' + this.namespace, '.js-close-mobile-menu', this.functions.mobileMenuClose.bind(this));
      this.$mobileDropdownContainer = $('.mobile-nav-column-inner', container);
      $(this.$container).on('click' + this.namespace, '.js-mobile-dropdown-trigger', this.functions.mobileMenuDropdownOpen.bind(this));
      $(this.$container).on('click' + this.namespace, '.js-mobile-dropdown-return', this.functions.mobileMenuDropdownClose.bind(this));


      // open newsletter form on click
      if (this.$newsletterSignupButton.length > 0) {
        $(this.$container).on('click' + this.namespace, '.js-header-newsletter-open', function () {
          $.colorbox({
            transition: 'none',
            html: $('.header-newsletter-wrapper').html(),
            onOpen: theme.colorboxFadeTransOnOpen,
            onComplete: theme.colorboxFadeTransOnComplete });

        });
        // show newsletter form if it contains messages
        if ($('.header-newsletter-wrapper .form-success, .header-newsletter-wrapper .errors').length) {
          $.colorbox({
            transition: 'fade',
            html: $('.header-newsletter-wrapper').html(),
            onOpen: theme.colorboxFadeTransOnOpen,
            onComplete: theme.colorboxFadeTransOnComplete });

        }
      }

      // aria labels
      $('.main-nav__has-dropdown > a, .main-nav__child-has-dropdown > a', this.$container).attr('aria-haspopup', 'true').attr('aria-expanded', 'false');
      this.$container.on('mouseenter' + this.namespace + ' mouseleave' + this.namespace, '.main-nav__has-dropdown, .main-nav__child-has-dropdown', function (evt) {
        if (evt.type == 'mouseenter') {
          $(this).children('[aria-expanded]').attr('aria-expanded', true);
          $(this).addClass('show-dropdown');
        } else {
          $(this).children('[aria-expanded]').attr('aria-expanded', false);
          $(this).removeClass('show-dropdown');
        }
      });

      // keyboard navigation - parent links
      this.$container.on('keydown' + this.namespace, '.main-nav__has-dropdown > .main-nav__link', function (evt) {
        if (evt.which == 40) {// Down arrow
          evt.preventDefault();
          $(evt.target).trigger('mouseenter');
        }

        if (evt.which == 38 || evt.which == 27) {// Up arrow or esc key
          evt.preventDefault();
          $(evt.target).trigger('mouseleave');
        }
      });

      // keyboard navigation - child links
      this.$container.on('keydown' + this.namespace, '.main-nav__child-has-dropdown > .main-nav__child-link', function (evt) {
        if (evt.which == 39 || evt.which == 40) {// Right arrow or down arrow
          evt.preventDefault();
          $(evt.target).trigger('mouseenter');
        }

        if (evt.which == 37 || evt.which == 38 || evt.which == 27) {// Left arrow, up arrow or esc key
          evt.preventDefault();
          $(evt.target).trigger('mouseleave');
        }
      });

      // keyboard navigation - grandchild links
      this.$container.on('keydown' + this.namespace, '.main-nav__sub-child-link', function (evt) {
        if (evt.which == 27) {// Esc key
          evt.preventDefault();
          $(evt.target).trigger('mouseleave');
        }
      });

      // touch events
      $(this.$container).on('touchstart' + this.namespace + ' touchend' + this.namespace + ' click' + this.namespace, '.main-nav__has-dropdown > .main-nav__link, .main-nav__child-has-dropdown > .main-nav__child-link', function (evt) {

        // unless showing mobile menu
        if (!$(this).next('.dropdown-chevron').is(':visible')) {
          if (evt.type == 'touchstart') {
            $(this).data('touchstartedAt', evt.timeStamp);
          } else if (evt.type == 'touchend') {
            // down & up in under a second - presume tap
            if (evt.timeStamp - $(this).data('touchstartedAt') < 1000) {
              $(this).data('touchOpenTriggeredAt', evt.timeStamp);
              if ($(this).parent().hasClass('show-dropdown')) {
                // trigger close
                $(this).trigger('mouseleave');
              } else {
                // trigger close on any open items
                $('.main-nav .show-dropdown').removeClass('show-dropdown').children('a').attr('aria-expanded', false);
                // trigger open
                $(this).trigger('mouseenter');
              }
              // prevent fake click
              return false;
            }
          } else if (evt.type == 'click') {
            // if touch open was triggered very recently, prevent click event
            if ($(this).data('touchOpenTriggeredAt') && evt.timeStamp - $(this).data('touchOpenTriggeredAt') < 1000) {
              return false;
            }
          }
        }

        if (evt.type === 'click' && theme.device.isTouch() && window.innerWidth >= 1024) {
          evt.preventDefault();
        }
      });

      // keep menus in viewport
      this.functions.assessMenuPositions.bind(this)();
      $(window).on('debouncedresize' + this.namespace, this.functions.assessMenuPositions.bind(this));

      // localization
      $('.disclosure', this.$container).each(function () {
        $(this).data('disclosure', new theme.Disclosure($(this)));
      });
    };

    this.functions = {
      /**
      * Ensure dropdown menus do not go off the right-edge of the page
      */
      assessMenuPositions: function assessMenuPositions() {
        var windowWidth = $(window).width();
        $('.main-nav__dropdown', this.$container).each(function () {
          var thisWidth = $(this).outerWidth();

          // this dropdown
          var gutter = 20;
          var marginLeft = parseInt($(this).css('margin-left')) || 0;
          var offEdgeAmount = windowWidth - gutter - ($(this).offset().left - marginLeft + thisWidth);
          $(this).css('margin-left', offEdgeAmount < 0 ? offEdgeAmount : '');

          // child dropdown
          $(this).toggleClass(
          'main-nav__dropdown--expand-left',
          $(this).offset().left + thisWidth * 2 > windowWidth);

        });
      },

      /**
      * Fetching search results
      */
      fetchSearchResults: function fetchSearchResults(e) {
        var $input = $(e.target);
        var terms = $input.val();
        var includeMeta = false;
        if (this.$searchInput.data('live-search-meta')) {
          includeMeta = true;
        }

        // only do something if search terms have changed
        if (terms != $input.data('previous-terms')) {
          $input.data('previous-terms', terms);

          // is it a valid search term
          if (terms.length > 0) {
            // abort first, let callbacks run
            if (this.searchXhr) {
              this.searchXhr.abort();
            }

            // add class to show results, in case it's closed. Also hide existing items.
            this.$searchBar.addClass('search-bar--show-results search-bar--loading').removeClass('search-bar--has-results');

            // build search url
            var $form = $input.closest('form');
            var searchUrl = $form.attr('action') + ($form.attr('action').indexOf('?') > -1 ? '&' : '?') + $form.serialize();

            // build request for api or fallback
            var ajaxUrl, ajaxData;
            if (theme.shopifyFeatures.predictiveSearch) {
              // use the API
              ajaxUrl = theme.routes.search_url + '/suggest.json';
              ajaxData = {
                "q": $form.find('input[name="q"]').val(),
                "resources": {
                  "type": $form.find('input[name="type"]').val(),
                  "limit": 12,
                  "options": {
                    "unavailable_products": 'last',
                    "fields": includeMeta ? "title,product_type,variants.title,vendor,tag,variants.sku" : "title,product_type,variants.title,vendor" } } };



            } else {
              // use the theme template fallback
              ajaxUrl = $form.attr('action') + '?' + $form.serialize() + '&view=data';
              ajaxData = null;
            }

            // fetch search results
            this.searchXhr = $.ajax({
              url: ajaxUrl,
              data: ajaxData,
              dataType: "json",
              success: this.functions.buildSearchResults.bind(this, searchUrl) }).
            always(function () {
              this.searchXhr = null;
              this.$searchBar.removeClass('search-bar--loading');
            }.bind(this));
          } else {
            if (this.searchXhr) {
              this.searchXhr.abort();
            }
            this.$searchBar.removeClass('search-bar--loading search-bar--has-results');
          }
        }
      },

      /**
      * Build search results from response
      */
      buildSearchResults: function buildSearchResults(searchUrl, response) {
        this.$searchBar.addClass('search-bar--has-results');
        var $resultsContainer = $('.search-bar__results-list', this.$searchBar).empty();
        if (
        response.resources.results.products && response.resources.results.products.length > 0 ||
        response.resources.results.pages && response.resources.results.pages.length > 0 ||
        response.resources.results.articles && response.resources.results.articles.length > 0)
        {
          var $productResults = $('<div class="search-bar__results-products">');
          var $pageResults = $('<div class="search-bar__results-pages">');

          if (response.resources.results.products) {
            for (var i = 0; i < response.resources.results.products.length; i++) {
              var result = response.resources.results.products[i];

              var $item = $('<a class="mini-product">').attr('href', result.url);
              var $imgCont = $('<div class="mini-product__image-container">').appendTo($item);
              if (result.image) {
                $('<img class="mini-product__image" alt="" role="presentation"/>').attr('src', slate.Image.getSizedImageUrl(result.image, '100x100_crop_center')).appendTo($imgCont);
              }
              var $details = $('<div class="mini-product__details">').appendTo($item);
              $('<div class="mini-product__title">').html(result.title).appendTo($details);

              if (this.$searchInput.data('live-search-vendor')) {
                $('<div class="mini-product__vendor small-text">').html(result.vendor).appendTo($details);
              }

              if (this.$searchInput.data('live-search-price')) {
                var $price = $('<div class="mini-product__price">').html(theme.Shopify.formatMoney(result.price_min, theme.moneyFormatWithCodePreference)).appendTo($details);
                if (parseFloat(result.compare_at_price_min) > parseFloat(result.price_min)) {
                  $price.addClass('mini-product__price--on-sale');
                }
              }

              $item.appendTo($productResults);
            }
          }

          if (response.resources.results.pages) {
            for (var i = 0; i < response.resources.results.pages.length; i++) {
              var result = response.resources.results.pages[i];
              $('<a class="search-bar__results-pages__link">').attr('href', result.url).html(result.title).appendTo($pageResults);
            }
          }

          if (response.resources.results.articles) {
            for (var i = 0; i < response.resources.results.articles.length; i++) {
              var result = response.resources.results.articles[i];
              $('<a class="search-bar__results-pages__link">').attr('href', result.url).html(result.title).appendTo($pageResults);
            }
          }

          $resultsContainer.append($productResults);

          if ($pageResults.children().length) {
            $('<h6 class="search-bar__results-pages-title small-cap-heading">').html(theme.strings.searchResultsPages).prependTo($pageResults);
            $resultsContainer.append($pageResults);
          }
          $('<a class="search-bar__results-all-link">').html(theme.strings.searchResultsViewAll).attr('href', searchUrl).appendTo($resultsContainer);
        } else {
          $('<div>').html(theme.strings.searchResultsNoResults).appendTo($resultsContainer);
        }
      },

      /**
       * Event for showing the mobile navigation
       */
      mobileMenuOpen: function mobileMenuOpen(evt) {
        evt.preventDefault();
        $(document.body).addClass('mobile-menu-prime');
        setTimeout(function () {
          $(document.body).addClass('mobile-menu-open');
        }, 10);
      },

      /**
       * Event for closing the mobile navigation
       */
      mobileMenuClose: function mobileMenuClose(evt) {
        evt.preventDefault();
        $(document.body).removeClass('mobile-menu-open');
        setTimeout(function () {
          $(document.body).removeClass('mobile-menu-prime');
        }, 500);
      },

      /**
       * Event for opening a mobile dropdown menu
       */
      mobileMenuDropdownOpen: function mobileMenuDropdownOpen(evt) {
        evt.preventDefault();
        var $dropdownToShow = $(evt.currentTarget).siblings('.main-nav__dropdown');
        if ($dropdownToShow.length) {
          // show level 2 dropdown
          var $newDropdown = $dropdownToShow.clone().wrap('<div class="mobile-nav-menu-container mobile-dropdown mobile-menu-level-2">').parent();
          // add return link
          $('<a class="mobile-dropdown__back js-mobile-dropdown-return" href="#">').html(
          [
          '<span class="feather-icon">',
          theme.icons.arrowLeft,
          '</span><span class="mobile-dropdown__back-text">',
          $(evt.currentTarget).siblings('.main-nav__link').html(),
          '</span>'].
          join('')).
          prependTo($newDropdown);
          this.$mobileDropdownContainer.append($newDropdown);
          setTimeout(function () {
            this.$mobileDropdownContainer.addClass('show-mobile-menu-level-2');
          }.bind(this), 10);
        } else {
          $dropdownToShow = $(evt.currentTarget).siblings('.main-nav__sub-dropdown');
          if ($dropdownToShow.length) {
            // show level 3 dropdown
            var $newDropdown = $dropdownToShow.clone().wrap('<div class="mobile-nav-menu-container mobile-dropdown mobile-menu-level-3">').parent();
            // add return link
            $('<a class="mobile-dropdown__back js-mobile-dropdown-return" href="#">').html(
            [
            '<span class="feather-icon">',
            theme.icons.arrowLeft,
            '</span><span class="mobile-dropdown__back-text">',
            $(evt.currentTarget).siblings('.main-nav__child-link').html(),
            '</span>'].
            join('')).
            prependTo($newDropdown);
            this.$mobileDropdownContainer.append($newDropdown);
            setTimeout(function () {
              this.$mobileDropdownContainer.addClass('show-mobile-menu-level-3');
            }.bind(this), 10);
          }
        }
      },

      /**
       * Event for closing a mobile dropdown menu
       */
      mobileMenuDropdownClose: function mobileMenuDropdownClose(evt) {
        evt.preventDefault();
        if (this.$mobileDropdownContainer.hasClass('show-mobile-menu-level-3')) {
          // transition out level 3 dropdown
          this.$mobileDropdownContainer.removeClass('show-mobile-menu-level-3');
          // remove menu element after transition time
          var $toRemove = this.$mobileDropdownContainer.find('.mobile-menu-level-3');
          setTimeout(function () {
            $toRemove.remove();
          }, this.mobileMenuTransitionTime);
        } else if (this.$mobileDropdownContainer.hasClass('show-mobile-menu-level-2')) {
          // transition out level 2 dropdown
          this.$mobileDropdownContainer.removeClass('show-mobile-menu-level-2');
          // remove menu element after transition time
          var $toRemove = this.$mobileDropdownContainer.find('.mobile-menu-level-2');
          setTimeout(function () {
            $toRemove.remove();
          }, this.mobileMenuTransitionTime);
        }
      } };


    this.onSectionUnload = function () {
      this.$container.off(this.namespace);
      $('.js-header-search-trigger', this.$container).off(this.namespace);
      $('.search-form__input', this.$container).off(this.namespace);
      $(document).off(this.namespace);
      $(window).off(this.namespace);
      this.$searchBar.off(this.namespace);
      $('.disclosure', this.$container).each(function () {
        $(this).data('disclosure').unload();
      });
    };
  }();
  ;
  /**
   * Footer Script
   * ------------------------------------------------------------------------------
   *
   * @namespace Footer
   */

  theme.Footer = new function () {
    this.onSectionLoad = function (container) {
      this.$container = $(container);
      this.namespace = theme.namespaceFromSection(container);

      // localization
      $('.disclosure', this.$container).each(function () {
        $(this).data('disclosure', new theme.Disclosure($(this)));
      });
    };

    this.onSectionUnload = function () {
      $('.disclosure', this.$container).each(function () {
        $(this).data('disclosure').unload();
      });
    };
  }();
  ;
  /**
   * Banner Section Script
   * ------------------------------------------------------------------------------
   *
   * @namespace Banner
   */

  theme.Banner = new function () {
    this.onSectionLoad = function (container) {
      this.$container = $(container);
      this.namespace = theme.namespaceFromSection(container);
      this.$slideshow = $('.slideshow', this.$container);
      this.stackBreakpoint = 840;

      // Initialise slideshow
      this.$slideshow.on('init', function () {
        $('.lazyload--manual', this).removeClass('lazyload--manual').addClass('lazyload');
      }).slick({
        autoplay: this.$slideshow.data('autoplay'),
        fade: this.$slideshow.data('transition') != 'slide',
        speed: this.$slideshow.data('transition') == 'instant' ? 0 : 500,
        autoplaySpeed: this.$slideshow.data('autoplay-speed') * 1000,
        infinite: true,
        useTransform: true,
        arrows: false,
        dots: this.$slideshow.find('.slide').length > 1,
        pauseOnHover: this.$slideshow.data('transition') != 'instant' || this.$slideshow.data('autoplay-speed') > 2 // no pause when quick & instant // no pause when quick & instant
      });

      // Slideshow
      this.$companionContent = $('.banner-section__companion-column .overlay__inner', this.$container);
      if (this.$companionContent.children().length > 1) {
        this.functions.assessCompanionCarousel.bind(this)();
        $(window).on('debouncedresize' + this.namespace, this.functions.assessCompanionCarousel.bind(this));
      }
    };

    this.functions = {
      /**
      * Enable/disable carousel on companion content based on screen size
      */
      assessCompanionCarousel: function assessCompanionCarousel() {
        if ($(window).width() < this.stackBreakpoint) {
          if (!this.$companionContent.hasClass('slick-slider')) {
            this.$companionContent.addClass('slick-slider').children().addClass('slide');
            this.$companionContent.parent().addClass('overlay--with-slider');
            this.$companionContent.slick({
              autoplay: true,
              fade: false,
              infinite: true,
              useTransform: true,
              arrows: false,
              dots: false,
              autoplaySpeed: 7000 // 7 seconds between slides
            });
          }
        } else {
          if (this.$companionContent.hasClass('slick-slider')) {
            this.$companionContent.slick('unslick');
            this.$companionContent.parent().removeClass('overlay--with-slider');
            this.$companionContent.removeClass('slick-slider').children().removeClass('slide');
          }
        }
      } };


    this.onBlockSelect = function (block) {
      $(block).closest('.slick-slider').
      slick('slickGoTo', $(block).data('slick-index')).
      slick('slickPause');
    };

    this.onBlockDeselect = function (block) {
      $(block).closest('.slick-slider').
      slick('slickPlay');
    };

    this.onSectionUnload = function () {
      this.$slideshow.slick('unslick').off('init');
      if (this.$companionContent.hasClass('slick-slider')) {
        this.$companionContent.slick('unslick');
      }
      $(window).off(this.namespace);
    };
  }();
  ;
  /**
   * Featured Collection Section Script
   * ------------------------------------------------------------------------------
   *
   * @namespace FeaturedCollection
   */

  theme.FeaturedCollection = new function () {
    this.onSectionLoad = function (container) {
      this.$container = $(container);
      this.namespace = theme.namespaceFromSection(container);
      this.$carousel = $('[data-grid-carousel]', this.$container);

      if (this.$carousel.length) {
        // switch to swiper classes
        this.$carousel.
        addClass('swiper-container').
        children('.grid').
        addClass('swiper-wrapper').
        removeClass('grid').
        children().
        addClass('swiper-slide').
        removeClass('grid__item');
        // init swiper
        this.carouselSwiper = new Swiper(this.$carousel, {
          init: false,
          //loop: true,
          //loopedSlides: 6,
          freeMode: false,
          slidesPerView: this.$carousel.data('grid-carousel-columns'),
          autoHeight: false,
          grabCursor: true,
          effect: 'slide',
          centeredSlides: false,
          spaceBetween: 14,
          navigation: {
            nextEl: $('.carousel-next', this.$container),
            prevEl: $('.carousel-prev', this.$container) },

          autoplay: false,
          breakpoints: {
            768: {
              slidesPerView: 2 },

            560: {
              spaceBetween: 12,
              freeMode: true,
              slidesPerView: 2 } } });



        this.carouselSwiper.once('init', function (evt) {
          this.$el.find('.swiper-slide-duplicate .lazyloading').addClass('lazyload');
        });
        this.carouselSwiper.init();
      }

      // note: adds event to window
      theme.initProductTitleAlignmentWatcher(this.$container, this.namespace);
    };

    this.onSectionUnload = function () {
      $(window).off(this.namespace);
      if (this.$carousel.length) {
        this.carouselSwiper.destroy();
      }
    };
  }();
  ;
  /**
   * MiniCollectionList Section Script
   * ------------------------------------------------------------------------------
   *
   * @namespace MiniCollectionList
   */

  theme.MiniCollectionList = new function () {
    this.onSectionLoad = function (container) {
      this.$container = $(container);
      this.namespace = theme.namespaceFromSection(container);
      this.$slideshow = $('.swiper-container', this.$container);

      /**
       * Swiper slideshow
       */
      var slidesperView = 4;
      if ($('.sidebar').length) {
        slidesperView = 3;
      }

      var count = this.$slideshow.find('.swiper-slide', this.$container).length;
      if (count > 0) {
        this.mySwiper = new Swiper(this.$slideshow, {
          //loop: true,
          //loopedSlides: count,
          freeMode: true,
          slidesPerView: slidesperView,
          grabCursor: true,
          spaceBetween: 14,
          navigation: {
            nextEl: "[data-section-id=\"".concat(this.$container.attr('data-section-id'), "\"] .mini-collection-slider-next"),
            prevEl: "[data-section-id=\"".concat(this.$container.attr('data-section-id'), "\"] .mini-collection-slider-prev") },

          breakpoints: {
            1090: {
              slidesPerView: slidesperView - 1 },

            720: {
              slidesPerView: slidesperView - 2 },

            520: {
              slidesPerView: 1,
              spaceBetween: 12 } } });



      }
    };

    this.onBlockSelect = function (block) {
      if (this.mySwiper) {
        this.mySwiper.slideTo($(block).index(), 1000);
      }
    };

    this.onSectionUnload = function () {
      if (this.mySwiper) {
        this.mySwiper.destroy();
      }
    };
  }();
  ;
  /**
   * LogoList Section Script
   * ------------------------------------------------------------------------------
   *
   * @namespace LogoList
   */

  theme.LogoList = new function () {
    this.onSectionLoad = function (container) {
      this.$container = $(container);
      this.namespace = theme.namespaceFromSection(container);
      this.$slideshow = $('.swiper-container', this.$container);

      /**
       * Swiper slideshow
       */
      var firstBreakPoint = 768;
      if ($('body').hasClass('page-has-sidebar')) {
        firstBreakPoint = 1000;
      }
      var slidesPerView = this.$slideshow.data('items-per-row');
      var slideCount = this.$slideshow.find('.swiper-slide').length;
      if (slideCount > 0) {
        this.mySwiper = new Swiper(this.$slideshow, {
          freeMode: true,
          slidesPerView: this.$slideshow.data('items-per-row'),
          grabCursor: true,
          spaceBetween: 14,
          navigation: {
            nextEl: "[data-section-id=\"".concat(this.$container.attr('data-section-id'), "\"] .logo-list-slider-next"),
            prevEl: "[data-section-id=\"".concat(this.$container.attr('data-section-id'), "\"] .logo-list-slider-prev") },

          breakpoints: {
            [firstBreakPoint]: {
              slidesPerView: 3 },

            560: {
              slidesPerView: 3,
              spaceBetween: 12 } } });



      }
    };

    this.onBlockSelect = function (block) {
      if (this.mySwiper) {
        this.mySwiper.slideTo($(block).index(), 1000);
      }
    };

    this.onSectionUnload = function () {
      if (this.mySwiper) {
        this.mySwiper.destroy();
      }
    };
  }();
  ;
  /**
   * BackgroundVideo Script
   * ------------------------------------------------------------------------------
   *
   * @namespace BackgroundVideo
   */

  theme.BackgroundVideo = new function () {
    this.onSectionLoad = function (container) {
      theme.VideoManager.onSectionLoad(container);

    };

    this.onSectionUnload = function () {
      theme.VideoManager.onSectionUnload(container);
    };
  }();
  ;
  theme.Gallery = new function () {
    this.onSectionLoad = function (container) {
      this.$container = $(container);
      this.namespace = theme.namespaceFromSection(container);
      this.$carouselGallery = $('.gallery--mobile-carousel', container);
      if (this.$carouselGallery.length) {
        var assessCarouselFunction = function assessCarouselFunction() {
          var isCarousel = !!this.carouselSwiper,
          shouldShowCarousel = this.$carouselGallery.css('display') === 'flex';

          if (!shouldShowCarousel) {
            $('.lazyload--manual', this.$carouselGallery).removeClass('lazyload--manual').addClass('lazyload');
          }

          if (isCarousel && !shouldShowCarousel) {
            // Destroy carousel

            // - unload swiper
            this.carouselSwiper.destroy();
            this.carouselSwiper = null;

            // - de-structure swiper
            this.$carouselGallery.removeClass('swiper-container').
            find('.swiper-slide').
            removeClass('swiper-slide').
            addClass('gallery__item').
            appendTo(this.$carouselGallery);
            this.$carouselGallery.find('.swiper-wrapper').remove();

            // - re-row items
            var rowLimit = 3;
            var $currentRow = null;
            this.$carouselGallery.find('.gallery__item').each(function (index, item) {
              if (index % rowLimit === 0) {
                $currentRow = $('<div class="gallery__row">').addClass(Math.floor(index / 3) % 2 === 0 ? 'gallery__row--odd' : 'gallery__row--even').appendTo(this.$carouselGallery);
              }
              $(item).appendTo($currentRow);
            }.bind(this));
          } else if (!isCarousel && shouldShowCarousel) {
            // Create carousel

            // - de-row items
            this.$carouselGallery.find('.gallery__item').appendTo(this.$carouselGallery);
            this.$carouselGallery.find('.gallery__row').remove();

            // - convert to swiper structure
            this.$carouselGallery.addClass('swiper-container');
            var $swiperWrapper = $('<div class="swiper-wrapper">').appendTo(this.$carouselGallery);
            this.$carouselGallery.find('.gallery__item').removeClass('gallery__item').addClass('swiper-slide').appendTo($swiperWrapper);

            // - init carousel
            this.carouselSwiper = new Swiper(this.$carouselGallery, {
              init: false,
              //loop: true,
              //loopedSlides: 6,
              freeMode: false,
              slidesPerView: 1,
              autoHeight: false,
              grabCursor: true,
              effect: 'slide',
              centeredSlides: false,
              spaceBetween: 14,
              // navigation: {
              //   nextEl: $('.carousel-next', this.$container),
              //   prevEl: $('.carousel-prev', this.$container),
              // },
              autoplay: false });

            this.carouselSwiper.once('init', function (evt) {
              this.$el.find('.swiper-slide-duplicate .lazyloading').addClass('lazyload');
            });
            this.carouselSwiper.init();
          }
        };

        assessCarouselFunction.call(this);
        $(window).on('debouncedresize' + this.namespace, assessCarouselFunction.bind(this));
      }
    };

    this.onSectionUnload = function (container) {
      $(window).off(this.namespace);
      if (this.carouselSwiper) {
        this.carouselSwiper.destroy();
      }
    };

    this.onBlockSelect = function (block) {
    };

    this.onBlockDeselect = function (block) {
    };
  }();

  /**
   * Collection Script
   * ------------------------------------------------------------------------------
   * For collection pages
   *
   * @namespace collection
   */

  theme.Collection = new function () {
    this.onSectionLoad = function (container) {
      theme.initProductTitleAlignmentWatcher($(container), '.collectionTemplate');
    };

    this.onSectionUnload = function () {};
  }();
  ;
  /**
   * Cart Template Script
   * ------------------------------------------------------------------------------
   * For the cart page
   *
   * @namespace main-cart
   */

  theme.Cart = new function () {

    var selectors = {
      termsCheckbox: '#terms' };


    this.onSectionLoad = function (container) {
      this.$container = $(container);
      this.namespace = '.cartTemplate';

      // show/hide shipping estimates
      this.$container.on('click' + this.namespace, '.js-shipping-calculator-trigger', function () {
        var $this = $(this);
        var $parent = $this.parents('.shipping-calculator-container');
        $parent.toggleClass('calculator-open');
        if ($parent.hasClass('calculator-open')) {
          $this.children().html(theme.strings.cart_shipping_calculator_hide_calculator);
          $parent.children('.shipping-calculator').slideDown(250);
        } else {
          $this.children().html(theme.strings.cart_shipping_calculator_title);
          $parent.children('.shipping-calculator').slideUp(250);
        }
      });

      // show/hide the cart notes
      this.$container.on('click' + this.namespace, '.js-cart-notes-trigger', function () {
        var $this = $(this);
        var $parent = $this.parent('.cart-notes-container');
        $parent.toggleClass('notes-open');
        if ($parent.hasClass('notes-open')) {
          $this.children().html(theme.strings.cart_general_hide_note);
          $parent.children('.cart-notes').slideDown(250);
        } else {
          $this.children().html(theme.strings.cart_general_show_note);
          $parent.children('.cart-notes').slideUp(250);
        }
      });

      // terms and conditions checkbox
      if ($(selectors.termsCheckbox, container).length > 0) {
        $(document).on('click' + this.namespace, '[name="checkout"], a[href="/checkout"]', function () {
          if ($(selectors.termsCheckbox + ':checked').length == 0) {
            alert(theme.strings.cartTermsNotChecked);
            return false;
          }
        });
      }

      // quantity adjustment
      if (this.$container.data('ajax-update')) {
        var updateCartFunction = this.functions.updateCart.bind(this);
        this.$container.on('keyup' + this.namespace + ' change' + this.namespace, '.quantity-adjuster__input', function () {
          if ($(this).data('initial-value') && $(this).data('initial-value') == $(this).val()) {
            return;
          }
          if ($(this).val().length == 0 || $(this).val() == '0') {
            return;
          }
          var inputId = $(this).attr('id');
          updateCartFunction({
            line: $(this).data('line'),
            quantity: $(this).val() },
          function () {
            // set focus inside input that changed
            console.log('Focussing on: ' + '#' + inputId);
            $('#' + inputId).focus();
          });
          $(this).data('previousValue', $(this).val());
        });

        this.$container.on('click' + this.namespace, '.quantity-adjuster__button--down, .quantity-adjuster__button--up', function (e) {
          var $input = $(this).closest('.quantity-adjuster').find('.quantity-adjuster__input');
          if ($(this).hasClass('quantity-adjuster__button--down')) {
            $input.val(parseInt($input.val()) - 1).trigger('change');
          } else {
            $input.val(parseInt($input.val()) + 1).trigger('change');
          }
          return false;
        });
      }

      theme.cartNoteMonitor.load($('.cart-notes [name="note"]', this.$container));

      // note: adds event to window
      theme.initProductTitleAlignmentWatcher(this.$container, this.namespace);
    };

    this.functions = {
      /**
       * Function for changing the cart and updating the page
       */
      updateCart: function updateCart(params, successCallback) {
        var _ = this;
        if (_.cartXhr) {
          _.cartXhr.abort();
        }
        if (_.cartRefreshXhr) {
          _.cartRefreshXhr.abort();
        }
        _.cartXhr = $.ajax({
          type: 'POST',
          url: theme.routes.cart_change_url + '.js',
          data: params,
          dataType: 'json',
          success: function success(data) {
            if (_.cartRefreshXhr) {
              _.cartRefreshXhr.abort();
            }

            // fetch new html for the page
            _.cartRefreshXhr = $.ajax({
              type: 'GET',
              url: theme.routes.cart_url + '?view=ajax',
              success: function success(data) {
                var toReplace = ['.cart-items', '.cart-subtotal-and-discounts'];
                var $newDom = $('<div>' + data + '</div>');
                $newDom.find('.fade-in').removeClass('fade-in');

                for (var i = 0; i < toReplace.length; i++) {
                  $('[data-section-type="cart"] ' + toReplace[i]).html(
                  $newDom.find(toReplace[i]).html());

                }

                successCallback();
              },
              error: function error(data) {
                if (data.statusText != 'abort') {
                  console.log('Error refreshing page');
                  console.log(data);
                }
              },
              complete: function complete() {
                _.cartRefreshXhr = null;
              } });

          },
          error: function error(data) {
            console.log('Error processing update');
            console.log(data);
          } });

      } };


    this.onSectionUnload = function () {
      $(window).off(this.namespace);
      $(document).off(this.namespace);
      this.$container.off(this.namespace);
      theme.cartNoteMonitor.unload($('.cart-notes [name="note"]', this.$container));
    };
  }();
  ;

  /*================ Templates ================*/
  /**
   * Customer Addresses Script
   * ------------------------------------------------------------------------------
   * A file that contains scripts highly couple code to the Customer Addresses
   * template.
   *
   * @namespace customerAddresses
   */

  theme.customerAddresses = function () {
    var $newAddressForm = $('#AddressNewForm');

    if (!$newAddressForm.length) {
      return;
    }

    // Initialize observers on address selectors, defined in shopify_common.js
    if (Shopify) {
      new Shopify.CountryProvinceSelector('AddressCountryNew', 'AddressProvinceNew', {
        hideElement: 'AddressProvinceContainerNew' });

    }

    // Initialize each edit form's country/province selector
    $('.address-country-option').each(function () {
      var formId = $(this).data('form-id');
      var countrySelector = 'AddressCountry_' + formId;
      var provinceSelector = 'AddressProvince_' + formId;
      var containerSelector = 'AddressProvinceContainer_' + formId;

      new Shopify.CountryProvinceSelector(countrySelector, provinceSelector, {
        hideElement: containerSelector });

    });

    // Toggle new/edit address forms
    $('.address-new-toggle').on('click', function () {
      $newAddressForm.toggleClass('hide');
    });

    $('.address-edit-toggle').on('click', function () {
      var formId = $(this).data('form-id');
      $('#EditAddress_' + formId).toggleClass('hide');
    });

    $('.address-delete').on('click', function () {
      var $el = $(this);
      var formId = $el.data('form-id');
      var confirmMessage = $el.data('confirm-message');
      if (confirm(confirmMessage || 'Are you sure you wish to delete this address?')) {
        Shopify.postLink(theme.routes.account_addresses_url + '/' + formId, { parameters: { _method: 'delete' } });
      }
    });
  }();
  ;
  /**
   * Password Template Script
   * ------------------------------------------------------------------------------
   * A file that contains scripts highly couple code to the Password template.
   *
   * @namespace password
   */

  theme.customerLogin = function () {
    var config = {
      recoverPasswordForm: '#RecoverPassword',
      hideRecoverPasswordLink: '#HideRecoverPasswordLink' };


    if (!$(config.recoverPasswordForm).length) {
      return;
    }

    checkUrlHash();
    resetPasswordSuccess();

    $(config.recoverPasswordForm).on('click', onShowHidePasswordForm);
    $(config.hideRecoverPasswordLink).on('click', onShowHidePasswordForm);

    function onShowHidePasswordForm(evt) {
      evt.preventDefault();
      toggleRecoverPasswordForm();
    }

    function checkUrlHash() {
      var hash = window.location.hash;

      // Allow deep linking to recover password form
      if (hash === '#recover') {
        toggleRecoverPasswordForm();
      }
    }

    /**
     *  Show/Hide recover password form
     */
    function toggleRecoverPasswordForm() {
      $('#RecoverPasswordForm').toggleClass('hide');
      $('#CustomerLoginForm').toggleClass('hide');
    }

    /**
     *  Show reset password success message
     */
    function resetPasswordSuccess() {
      var $formState = $('.reset-password-success');

      // check if reset password form was successfully submited.
      if (!$formState.length) {
        return;
      }

      // show success message
      $('#ResetSuccess').removeClass('hide');
    }
  }();
  ;


  theme.namespaceFromSection = function (container) {
    return ['.', $(container).data('section-type'), $(container).data('section-id')].join('');
  };

  theme.openPageContentInLightbox = function (url) {
    $.get(url, function (data) {
      var $content = $('#MainContent', $.parseHTML('<div>' + data + '</div>'));
      $.colorbox({
        transition: 'fade',
        html: '<div class="lightbox-content">' + $content.html() + '</div>',
        onOpen: theme.colorboxFadeTransOnOpen,
        onComplete: function onComplete() {
          theme.colorboxFadeTransOnComplete();
          // check any new inputs
          $('#cboxContent .input-wrapper input').trigger('inputstateEmpty');
        } });

    });
  };

  theme.initVariantSelectors = function ($els, data) {
    $els.each(function () {
      if (typeof $(this).data('selector-type') != 'dropdown') {
        // change swatch label on hover
        var $label = $(this).find('.js-option-title');
        if ($label.length) {
          $label.data('default-content', $label.html());
          $(this).on('change', function () {
            $label.data('default-content', $(this).find('.opt-btn:checked').val());
          }).on('mouseenter', '.opt-label', function () {
            $label.html($(this).prev().val());
          }).on('mouseleave', '.opt-label', function () {
            $label.html($label.data('default-content'));
          });
        }

        if (data.options.length == 1) {
          for (var i = 0; i < data.variants.length; i++) {
            var variant = data.variants[i];
            if (!variant.available) {
              $(this).find('.opt-btn').filter(function () {
                return $(this).val() == variant.option1;
              }).addClass('is-unavailable');
            }
          }
        }
      }
    });
  };

  theme.colorboxFadeTransOnOpen = function () {
    $('#colorbox').addClass('colorbox--hide');
  };

  theme.colorboxFadeTransOnComplete = function () {
    setTimeout(function () {
      $('#colorbox').addClass('colorbox--enable-trans');
      setTimeout(function () {
        $('#colorbox').removeClass('colorbox--hide');
        setTimeout(function () {
          $('#colorbox').removeClass('colorbox--enable-trans');
        }, 300);
      }, 20);
    }, 10);
  };

  theme.productGallerySlideshowTabFix = function (slides, current) {
    // tabindex everything to prevent tabbing into hidden slides
    $(slides[current]).find('a, input, button, select, iframe, video, model-viewer, [tabindex]').each(function () {
      if (typeof $(this).data('theme-slideshow-original-tabindex') !== 'undefined') {
        if ($(this).data('theme-slideshow-original-tabindex') === false) {
          $(this).removeAttr('tabindex');
        } else {
          $(this).attr('tabindex', $(this).data('theme-slideshow-original-tabindex'));
        }
      } else {
        $(this).removeAttr('tabindex');
      }
    });
    $(slides).not(slides[current]).find('a, input, button, select, iframe, video, model-viewer, [tabindex]').each(function () {
      if (typeof $(this).data('theme-slideshow-original-tabindex') === 'undefined') {
        $(this).data('theme-slideshow-original-tabindex',
        typeof $(this).attr('tabindex') !== 'undefined' ?
        $(this).attr('tabindex') :
        false);

        $(this).attr('tabindex', '-1');
      }
    });
  };

  try {
    theme.shopifyFeatures = JSON.parse(document.documentElement.querySelector('#shopify-features').textContent);
  } catch (e) {
    theme.shopifyFeatures = {};
  }

  $(document).ready(function () {
    // Common a11y fixes
    slate.a11y.pageLinkFocus($(window.location.hash));

    $('.in-page-link').on('click', function (evt) {
      slate.a11y.pageLinkFocus($(evt.currentTarget.hash));
    });

    // Enable focus style when using tab
    $(document).on('keyup.themeTabCheck', function (evt) {
      if (evt.keyCode === 9) {
        $('body').addClass('tab-used');
        $(document).off('keyup.themeTabCheck');
      }
    });

    // Target tables to make them scrollable
    var tableSelectors = '.rte table';

    slate.rte.wrapTable({
      $tables: $(tableSelectors),
      tableWrapperClass: 'rte__table-wrapper' });


    // Target iframes to make them responsive
    var iframeSelectors =
    '.rte iframe[src*="youtube.com/embed"],' +
    '.rte iframe[src*="player.vimeo"]';

    slate.rte.wrapIframe({
      $iframes: $(iframeSelectors),
      iframeWrapperClass: 'rte__video-wrapper' });


    document.querySelector('.footer-blocks').addEventListener('click', e => {
      if (!e.target.matches('.js-footer-block-toggle')) return;

      var btn = e.target;
      var content = btn.parentNode.nextElementSibling;

      btn.classList.toggle('is-active');

      if (btn.classList.contains('is-active')) {
        content.style.height = "".concat(content.scrollHeight, "px");
      } else {
        content.style.height = null;
      }
    });

    // Apply a specific class to the html element for browser support of cookies.
    if (slate.cart.cookiesEnabled()) {
      document.documentElement.className = document.documentElement.className.replace('supports-no-cookies', 'supports-cookies');
    }

    // Quantity input wrapper
    $(document).on('change', '.qty-wrapper > .cc-select', function () {
      var value = $(this).find('[aria-selected="true"]').data('value');
      var $input = $(this).siblings('.qty-actual').find('[name="quantity"]');
      if (value == '10+') {
        $input.val('10').closest('.qty-wrapper').addClass('hide-proxy');
        setTimeout(function () {
          $input.select().focus();
        }, 10);
      } else {
        $input.val(value);
      }
    });
  });

  theme.initProductTitleAlignmentWatcher = function ($container, namespace) {
    var $productGrids = $('.product-grid', $container);
    if ($productGrids.length) {
      theme.alignProductImageTitles.bind($productGrids)();
      $(window).on('debouncedresize' + namespace, theme.alignProductImageTitles.bind($productGrids));
    }
  };

  theme.alignProductImageTitles = function () {
    $(this).each(function () {
      var tallest = 0;
      $('.product-block__primary-image', this).each(function () {
        var h = $(this).height();
        if (h > tallest) {
          tallest = h;
        }
      });
      $('.product-block__image', this).css('min-height', tallest);
    });
  };

  if ($('.section-search').length) {
    theme.initProductTitleAlignmentWatcher($('.section-search'), 'main-search');
  }


  theme.Sections.init();
  theme.Sections.register('sidebar', theme.Sidebar, { deferredLoad: false });
  theme.Sections.register('product', theme.Product, { deferredLoad: false });
  theme.Sections.register('header', theme.Header, { deferredLoad: false });
  theme.Sections.register('footer', theme.Footer);
  theme.Sections.register('banner', theme.Banner);
  theme.Sections.register('featured-collection', theme.FeaturedCollection);
  theme.Sections.register('mini-collection-list', theme.MiniCollectionList);
  theme.Sections.register('logo-list', theme.LogoList);
  theme.Sections.register('background-video', theme.VideoManager, { deferredLoadViewportExcess: 800 });
  theme.Sections.register('gallery', theme.Gallery);
  theme.Sections.register('collection', theme.Collection, { deferredLoad: false });
  theme.Sections.register('cart', theme.Cart, { deferredLoad: false });


  //Register dynamically pulled in sections
  $(function ($) {
    if (cc.sections.length) {
      cc.sections.forEach(section => {
        try {
          var data = {};
          if (typeof section.deferredLoad !== 'undefined') {
            data.deferredLoad = section.deferredLoad;
          }
          if (typeof section.deferredLoadViewportExcess !== 'undefined') {
            data.deferredLoadViewportExcess = section.deferredLoadViewportExcess;
          }
          theme.Sections.register(section.name, section.section, data);
        } catch (err) {
          console.error("Unable to register section ".concat(section.name, "."), err);
        }
      });
    } else {
      console.warn('Barry: No common sections have been registered.');
    }
  });

})(theme.jQuery);  
/* Built with Barry v1.0.8 */