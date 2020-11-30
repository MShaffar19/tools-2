// Copyright 2020 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import {FocusEvent, ToolTipEvent} from '../events.mjs';
import {CSSColor} from '../helper.mjs';
import {DOM, V8CustomElement} from '../helper.mjs';

DOM.defineCustomElement(
    './view/map-panel/map-transitions',
    (templateText) => class MapTransitions extends V8CustomElement {
      _timeline;
      _map;
      _edgeToColor = new Map();
      _selectedMapLogEntries;
      _displayedMapsInTree;
      _toggleSubtreeHandler = this._handleToggleSubtree.bind(this);
      _selectMapHandler = this._handleSelectMap.bind(this);
      _mouseoverMapHandler = this._handleMouseoverMap.bind(this);

      constructor() {
        super(templateText);
        this.transitionView.addEventListener(
            'mousemove', (e) => this._handleTransitionViewChange(e));
        this.currentNode = this.transitionView;
      }

      get transitionView() {
        return this.$('#transitionView');
      }

      get tooltip() {
        return this.$('#tooltip');
      }

      get tooltipContents() {
        return this.$('#tooltipContents');
      }

      set map(map) {
        this._map = map;
        this._showMap();
      }

      set timeline(timeline) {
        this._timeline = timeline;
        this._edgeToColor.clear();
        timeline.getBreakdown().forEach(breakdown => {
          this._edgeToColor.set(breakdown.type, CSSColor.at(breakdown.id));
        });
      }

      set selectedMapLogEntries(list) {
        this._selectedMapLogEntries = list;
        this.update();
      }

      get selectedMapLogEntries() {
        return this._selectedMapLogEntries;
      }

      _handleTransitionViewChange(e) {
        this.tooltip.style.left = e.pageX + 'px';
        this.tooltip.style.top = e.pageY + 'px';
        const map = e.target.map;
        if (map) {
          this.tooltipContents.innerText = map.description;
        }
      }

      _selectMap(map) {
        this.dispatchEvent(new FocusEvent(map));
      }

      _showMap() {
        // TODO: highlight current map
      }

      _update() {
        this.transitionView.style.display = 'none';
        DOM.removeAllChildren(this.transitionView);
        this._displayedMapsInTree = new Set();
        // Limit view to 200 maps for performance reasons.
        this.selectedMapLogEntries.slice(0, 200).forEach(
            (map) => this._addMapAndParentTransitions(map));
        this._displayedMapsInTree = undefined;
        this.transitionView.style.display = '';
      }

      _addMapAndParentTransitions(map) {
        if (map === void 0) return;
        if (this._displayedMapsInTree.has(map)) return;
        this._displayedMapsInTree.add(map);
        this.currentNode = this.transitionView;
        let parents = map.getParents();
        if (parents.length > 0) {
          this._addTransitionTo(parents.pop());
          parents.reverse().forEach((each) => this._addTransitionTo(each));
        }
        let mapNode = this._addSubtransitions(map);
        // Mark and show the selected map.
        mapNode.classList.add('selected');
        if (this.selectedMap == map) {
          setTimeout(
              () => mapNode.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest',
              }),
              1);
        }
      }

      _addSubtransitions(map) {
        let mapNode = this._addTransitionTo(map);
        // Draw outgoing linear transition line.
        let current = map;
        while (current.children.length == 1) {
          current = current.children[0].to;
          this._addTransitionTo(current);
        }
        return mapNode;
      }

      _addTransitionEdge(map) {
        let classes = ['transitionEdge'];
        let edge = DOM.div(classes);
        edge.style.backgroundColor = this._edgeToColor.get(map.edge.type);
        let labelNode = DOM.div('transitionLabel');
        labelNode.innerText = map.edge.toString();
        edge.appendChild(labelNode);
        return edge;
      }

      _addTransitionTo(map) {
        // transition[ transitions[ transition[...], transition[...], ...]];
        this._displayedMapsInTree?.add(map);
        let transition = DOM.div('transition');
        if (map.isDeprecated()) transition.classList.add('deprecated');
        if (map.edge) {
          transition.appendChild(this._addTransitionEdge(map));
        }
        let mapNode = this._addMapNode(map);
        transition.appendChild(mapNode);

        let subtree = DOM.div('transitions');
        transition.appendChild(subtree);

        this.currentNode.appendChild(transition);
        this.currentNode = subtree;

        return mapNode;
      }

      _addMapNode(map) {
        let node = DOM.div('map');
        if (map.edge)
          node.style.backgroundColor = this._edgeToColor.get(map.edge.type);
        node.map = map;
        node.onclick = this._selectMapHandler
        node.onmouseover = this._mouseoverMapHandler
        if (map.children.length > 1) {
          node.innerText = map.children.length;
          const showSubtree = DOM.div('showSubtransitions');
          showSubtree.onclick = this._toggleSubtreeHandler
          node.appendChild(showSubtree);
        }
        else if (map.children.length == 0) {
          node.innerHTML = '&#x25CF;';
        }
        this.currentNode.appendChild(node);
        return node;
      }

      _handleSelectMap(event) {
        this._selectMap(event.currentTarget.map)
      }

      _handleMouseoverMap(event) {
        this.dispatchEvent(new ToolTipEvent(
            event.currentTarget.map.toString(), event.currentTarget));
      }

      _handleToggleSubtree(event) {
        event.preventDefault();
        const node = event.currentTarget.parentElement;
        let map = node.map;
        event.target.classList.toggle('opened');
        let transitionsNode = node.parentElement.querySelector('.transitions');
        let subtransitionNodes = transitionsNode.children;
        if (subtransitionNodes.length <= 1) {
          // Add subtransitions except the one that's already shown.
          let visibleTransitionMap = subtransitionNodes.length == 1 ?
              transitionsNode.querySelector('.map').map :
              void 0;
          map.children.forEach((edge) => {
            if (edge.to != visibleTransitionMap) {
              this.currentNode = transitionsNode;
              this._addSubtransitions(edge.to);
            }
          });
        } else {
          // remove all but the first (currently selected) subtransition
          for (let i = subtransitionNodes.length - 1; i > 0; i--) {
            transitionsNode.removeChild(subtransitionNodes[i]);
          }
        }
        return false;
      }
    });
