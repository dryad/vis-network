import Node from "./components/Node";
import Edge from "./components/Edge";
import { SelectionAccumulator } from "./selection";

import { selectiveDeepExtend } from "vis-util/esnext";

/**
 * The handler for selections
 */
class SelectionHandler {
  /**
   * @param {object} body
   * @param {Canvas} canvas
   */
  constructor(body, canvas) {
    this.body = body;
    this.canvas = canvas;
    // TODO: Consider firing an event on any change to the selection, not
    // only those caused by clicks and taps. It would be easy to implement
    // now and (at least to me) it seems like something that could be
    // quite useful.
    this._selectionAccumulator = new SelectionAccumulator();
    this.hoverObj = { nodes: {}, edges: {} };

    this.options = {};
    this.defaultOptions = {
      multiselect: false,
      selectable: true,
      selectConnectedEdges: true,
      hoverConnectedEdges: true,
    };
    Object.assign(this.options, this.defaultOptions);

    this.body.emitter.on("_dataChanged", () => {
      this.updateSelection();
    });

    this.lastHoveredNodes = [];
  }

  /**
   *
   * @param {object} [options]
   */
  setOptions(options) {
    if (options !== undefined) {
      const fields = [
        "multiselect",
        "hoverConnectedEdges",
        "selectable",
        "selectConnectedEdges",
      ];
      selectiveDeepExtend(fields, this.options, options);
    }
  }

  /**
   * handles the selection part of the tap;
   *
   * @param {{x: number, y: number}} pointer
   * @returns {boolean}
   */
  selectOnPoint(pointer) {
    let selected = false;
    if (this.options.selectable === true) {
      const obj = this.getNodeAt(pointer) || this.getEdgeAt(pointer);

      // unselect after getting the objects in order to restore width and height.
      this.unselectAll();

      if (obj !== undefined) {
        selected = this.selectObject(obj);
      }
      this.body.emitter.emit("_requestRedraw");
    }
    return selected;
  }

  /**
   *
   * @param {{x: number, y: number}} pointer
   * @returns {boolean}
   */
  selectAdditionalOnPoint(pointer) {
    let selectionChanged = false;
    if (this.options.selectable === true) {
      const obj = this.getNodeAt(pointer) || this.getEdgeAt(pointer);

      if (obj !== undefined) {
        selectionChanged = true;
        if (obj.isSelected() === true) {
          this.deselectObject(obj);
        } else {
          this.selectObject(obj);
        }

        this.body.emitter.emit("_requestRedraw");
      }
    }
    return selectionChanged;
  }

  /**
   * Create an object containing the standard fields for an event.
   *
   * @param {Event} event
   * @param {{x: number, y: number}} pointer Object with the x and y screen coordinates of the mouse
   * @returns {{}}
   * @private
   */
  _initBaseEvent(event, pointer) {
    const properties = {};
    if (pointer) {
      properties["pointer"] = {
        DOM: { x: pointer.x, y: pointer.y },
        canvas: this.canvas.DOMtoCanvas(pointer),
      };
    }
    properties["event"] = event;

    return properties;
  }

  /**
   * Generate an event which the user can catch.
   *
   * This adds some extra data to the event with respect to cursor position and
   * selected nodes and edges.
   *
   * @param {string} eventType                          Name of event to send
   * @param {Event}  event
   * @param {{x: number, y: number}} pointer            Object with the x and y screen coordinates of the mouse
   * @param {object | undefined} oldSelection             If present, selection state before event occured
   * @param {boolean|undefined} [emptySelection=false]  Indicate if selection data should be passed
   */
  generateClickEvent(
    eventType,
    event,
    pointer,
    oldSelection,
    emptySelection = false
  ) {
    const properties = this._initBaseEvent(event, pointer);

    if (emptySelection === true) {
      properties.nodes = [];
      properties.edges = [];
    } else {
      const tmp = this.getSelection();
      properties.nodes = tmp.nodes;
      properties.edges = tmp.edges;
    }

    if (oldSelection !== undefined) {
      properties["previousSelection"] = oldSelection;
    }

    if (eventType == "click") {
      // For the time being, restrict this functionality to
      // just the click event.
      properties.items = this.getClickedItems(pointer);
    }

    if (event.controlEdge !== undefined) {
      properties.controlEdge = event.controlEdge;
    }

    this.body.emitter.emit(eventType, properties);
  }

  /**
   *
   * @param {object} obj
   * @param {boolean} [highlightEdges=this.options.selectConnectedEdges]
   * @returns {boolean}
   */
  selectObject(obj, highlightEdges = this.options.selectConnectedEdges) {
    if (obj !== undefined) {
      if (obj instanceof Node) {
        if (highlightEdges === true) {
          this._selectionAccumulator.addEdges(...obj.edges);
        }
        this._selectionAccumulator.addNodes(obj);
      } else {
        this._selectionAccumulator.addEdges(obj);
      }

      const selectedNodes = [];
      for (const node of this._selectionAccumulator.getNodes()) {
        selectedNodes.push(node.id);
      }
      this.body.emitter.emit("selectedNodes", selectedNodes);
      return true;
    }
    this.body.emitter.emit("selectedNodes", []);
    return false;
  }

  /**
   *
   * @param {object} obj
   */
  deselectObject(obj) {
    if (obj.isSelected() === true) {
      obj.selected = false;
      this._removeFromSelection(obj);
    }
  }

  /**
   * retrieve all nodes overlapping with given object
   *
   * @param {object} object  An object with parameters left, top, right, bottom
   * @returns {number[]}   An array with id's of the overlapping nodes
   * @private
   */
  _getAllNodesOverlappingWith(object) {
    const overlappingNodes = [];
    const nodes = this.body.nodes;
    for (let i = 0; i < this.body.nodeIndices.length; i++) {
      const nodeId = this.body.nodeIndices[i];
      if (nodes[nodeId].isOverlappingWith(object)) {
        overlappingNodes.push(nodeId);
      }
    }
    return overlappingNodes;
  }

  /**
   * Return a position object in canvasspace from a single point in screenspace
   *
   * @param {{x: number, y: number}} pointer
   * @returns {{left: number, top: number, right: number, bottom: number}}
   * @private
   */
  _pointerToPositionObject(pointer) {
    const canvasPos = this.canvas.DOMtoCanvas(pointer);
    return {
      left: canvasPos.x - 1,
      top: canvasPos.y + 1,
      right: canvasPos.x + 1,
      bottom: canvasPos.y - 1,
    };
  }

  /**
   * Get the top node at the passed point (like a click)
   *
   * @param {{x: number, y: number}} pointer
   * @param {boolean} [returnNode=true]
   * @returns {Node | undefined} node
   */
  getNodeAt(pointer, returnNode = true) {
    // we first check if this is an navigation controls element
    const positionObject = this._pointerToPositionObject(pointer);
    const overlappingNodes = this._getAllNodesOverlappingWith(positionObject);
    // if there are overlapping nodes, select the last one, this is the
    // one which is drawn on top of the others
    if (overlappingNodes.length > 0) {
      if (returnNode === true) {
        return this.body.nodes[overlappingNodes[overlappingNodes.length - 1]];
      } else {
        return overlappingNodes[overlappingNodes.length - 1];
      }
    } else {
      return undefined;
    }
  }

  /**
   * retrieve all edges overlapping with given object, selector is around center
   *
   * @param {object} object  An object with parameters left, top, right, bottom
   * @param {number[]} overlappingEdges An array with id's of the overlapping nodes
   * @private
   */
  _getEdgesOverlappingWith(object, overlappingEdges) {
    const edges = this.body.edges;
    for (let i = 0; i < this.body.edgeIndices.length; i++) {
      const edgeId = this.body.edgeIndices[i];
      if (edges[edgeId].isOverlappingWith(object)) {
        overlappingEdges.push(edgeId);
      }
    }
  }

  /**
   * retrieve all nodes overlapping with given object
   *
   * @param {object} object  An object with parameters left, top, right, bottom
   * @returns {number[]}   An array with id's of the overlapping nodes
   * @private
   */
  _getAllEdgesOverlappingWith(object) {
    const overlappingEdges = [];
    this._getEdgesOverlappingWith(object, overlappingEdges);
    return overlappingEdges;
  }

  /**
   * Get the edges nearest to the passed point (like a click)
   *
   * @param {{x: number, y: number}} pointer
   * @param {boolean} [returnEdge=true]
   * @returns {Edge | undefined} node
   */
  getEdgeAt(pointer, returnEdge = true) {
    // Iterate over edges, pick closest within 10
    const canvasPos = this.canvas.DOMtoCanvas(pointer);
    let mindist = 10;
    let overlappingEdge = null;
    const edges = this.body.edges;
    for (let i = 0; i < this.body.edgeIndices.length; i++) {
      const edgeId = this.body.edgeIndices[i];
      const edge = edges[edgeId];
      if (edge.connected) {
        const xFrom = edge.from.x;
        const yFrom = edge.from.y;
        const xTo = edge.to.x;
        const yTo = edge.to.y;
        const dist = edge.edgeType.getDistanceToEdge(
          xFrom,
          yFrom,
          xTo,
          yTo,
          canvasPos.x,
          canvasPos.y
        );
        if (dist < mindist) {
          overlappingEdge = edgeId;
          mindist = dist;
        }
      }
    }
    if (overlappingEdge !== null) {
      if (returnEdge === true) {
        return this.body.edges[overlappingEdge];
      } else {
        return overlappingEdge;
      }
    } else {
      return undefined;
    }
  }

  /**
   * Add object to the selection array.
   *
   * @param {object} obj
   * @private
   */
  _addToHover(obj) {
    // console.log('addToHover', obj);
    if (obj instanceof Node) {
      this.hoverObj.nodes[obj.id] = obj;
    } else {
      this.hoverObj.edges[obj.id] = obj;
    }
    // console.log('this.hoverObj', this.hoverObj);
  }

  /**
   * Remove a single option from selection.
   *
   * @param {object} obj
   * @private
   */
  _removeFromSelection(obj) {
    if (obj instanceof Node) {
      this._selectionAccumulator.deleteNodes(obj);
      this._selectionAccumulator.deleteEdges(...obj.edges);
    } else {
      this._selectionAccumulator.deleteEdges(obj);
    }
  }

  /**
   * Unselect all nodes and edges.
   */
  unselectAll() {
    this._selectionAccumulator.clear();
  }

  /**
   * return the number of selected nodes
   *
   * @returns {number}
   */
  getSelectedNodeCount() {
    return this._selectionAccumulator.sizeNodes;
  }

  /**
   * return the number of selected edges
   *
   * @returns {number}
   */
  getSelectedEdgeCount() {
    return this._selectionAccumulator.sizeEdges;
  }

  /**
   * select the edges connected to the node that is being selected
   *
   * @param {Node} node
   * @private
   */
  _hoverConnectedEdges(node) {
    // console.log('hoverConnectedEdges');
    // console.log('this.body.nodes', this.body.nodes);
    //as a test, light up all nodes
    for (let i = 0; i < this.body.nodes.length; i++) {
      const node = this.body.nodes[i];
      node.hover = true;
      this._addToHover(node);
    }
    // console.log('this.body.nodes', this.body.nodes);
    for (let i = 0; i < node.edges.length; i++) {
      const edge = node.edges[i];
      edge.hover = true;
      this._addToHover(edge);
    }
  }

  /**
   * Remove the highlight from a node or edge, in response to mouse movement
   *
   * @param {Event}  event
   * @param {{x: number, y: number}} pointer object with the x and y screen coordinates of the mouse
   * @param {Node|vis.Edge} object
   * @private
   */
  emitBlurEvent(event, pointer, object) {
    // console.log('emitBlurEvent', object.options.id);
    const properties = this._initBaseEvent(event, pointer);

    if (object.hover === true) {
      object.hover = false;
      if (object instanceof Node) {
        properties.node = object.id;
        this.body.emitter.emit("blurNode", properties);
      } else {
        properties.edge = object.id;
        this.body.emitter.emit("blurEdge", properties);
      }
    }
  }

  /**
   * Create the highlight for a node or edge, in response to mouse movement
   *
   * @param {Event}  event
   * @param {{x: number, y: number}} pointer object with the x and y screen coordinates of the mouse
   * @param {Node|vis.Edge} object
   * @returns {boolean} hoverChanged
   * @private
   */
  emitHoverEvent(event, pointer, object) {
    const properties = this._initBaseEvent(event, pointer);
    let hoverChanged = false;

    if (object.hover === false) {
      object.hover = true;
      this._addToHover(object);
      hoverChanged = true;
      if (object instanceof Node) {
        properties.node = object.id;
        this.body.emitter.emit("hoverNode", properties);
      } else {
        properties.edge = object.id;
        this.body.emitter.emit("hoverEdge", properties);
      }
    }

    return hoverChanged;
  }

  /**
   * Perform actions in response to a mouse movement.
   *
   * @param {Event}  event
   * @param {{x: number, y: number}} pointer | object with the x and y screen coordinates of the mouse
   */
  async hoverObject(event, pointer) {
    let object = this.getNodeAt(pointer);
    if (object === undefined) {
      object = this.getEdgeAt(pointer);
    }
    let hoverChanged = false;

    if (object === undefined) {
      // As soon as we un-hover a node, and only once
      // emit signal with empty list of hovered nodes
      if (this.lastHoveredNodes.length > 0) {
        // console.log('setting empty nodes');
        this.body.emitter.emit("hoveredNodes", []);
        this.lastHoveredNodes = [];
      }
    }

    // remove all node hover highlights
    for (const nodeId in this.hoverObj.nodes) {
      if (Object.prototype.hasOwnProperty.call(this.hoverObj.nodes, nodeId)) {
        if (
          object === undefined ||
          (object instanceof Node && object.id != nodeId) ||
          object instanceof Edge
        ) {
          this.emitBlurEvent(event, pointer, this.hoverObj.nodes[nodeId]);
          delete this.hoverObj.nodes[nodeId];
          hoverChanged = true;
        }
      }
    }

    // removing all edge hover highlights
    for (const edgeId in this.hoverObj.edges) {
      if (Object.prototype.hasOwnProperty.call(this.hoverObj.edges, edgeId)) {
        // if the hover has been changed here it means that the node has been hovered over or off
        // we then do not use the emitBlurEvent method here.
        if (hoverChanged === true) {
          this.hoverObj.edges[edgeId].hover = false;
          delete this.hoverObj.edges[edgeId];
        }
        // if the blur remains the same and the object is undefined (mouse off) or another
        // edge has been hovered, or another node has been hovered we blur the edge.
        else if (
          object === undefined ||
          (object instanceof Edge && object.id != edgeId) ||
          (object instanceof Node && !object.hover)
        ) {
          this.emitBlurEvent(event, pointer, this.hoverObj.edges[edgeId]);
          delete this.hoverObj.edges[edgeId];
          hoverChanged = true;
        }
      }
    }

    if (object !== undefined) {
      const hoveredEdgesCount = Object.keys(this.hoverObj.edges).length;
      const hoveredNodesCount = Object.keys(this.hoverObj.nodes).length;
      const newOnlyHoveredEdge =
        object instanceof Edge &&
        hoveredEdgesCount === 0 &&
        hoveredNodesCount === 0;
      const newOnlyHoveredNode =
        object instanceof Node &&
        hoveredEdgesCount === 0 &&
        hoveredNodesCount === 0;

      if (hoverChanged || newOnlyHoveredEdge || newOnlyHoveredNode) {
        if (object instanceof Edge) {
          hoverChanged = this.emitHoverEvent(event, pointer, object);
        }
        if (object instanceof Node) {
          if (!object.isLabelNode) {
            hoverChanged = this.emitHoverEvent(event, pointer, object);
          }
        }
      }

      if (object instanceof Node && this.options.hoverConnectedEdges === true) {
        this._hoverConnectedEdges(object);
      }

      // console.log('VIS: window.isUserDragging', window.isUserDragging);
      if (
        (object instanceof Node &&
          (window.isUserDragging === undefined ||
            window.isUserDragging === false)) ||
        (window.wasUserDragging === true && window.isUserDragging === false)
      ) {
        // Find and hover all subordinate nodes. Runs when a new single node is hovered.
        // 1. hover a node - its id is the starting input
        // 2. if it is level zero, return only itself (or an empty list because no additional nodes should be hovered)
        // 3. if not level 0, then recurse:
        // -- find all edges where this node is the "to" node.
        // -- add the "from" and "eventual" node to the hover list
        // -- for each of those edges, recurse the algorithm on both "from" and "eventual" nodes.

        const subordinate_nodes = [];
        const find_subordinate_nodes = (node_id) => {
          if (
            this.body.nodes[node_id] &&
            this.body.nodes[node_id].level !== 0
          ) {
            // Check for undefined because the edge tool creates a node temporarily, which will read undefined here and crash.
            // Skip if the node is level 0, it does not have any subordinate nodes

            // -- find all edges where this node is the "to" node
            const edges_with_to_node = Object.values(this.body.edges).filter(
              (edge) => edge.toId === node_id
            );

            // -- add the "from" and "eventual" node to the hover list
            for (let i = 0; i < edges_with_to_node.length; i++) {
              const edge = edges_with_to_node[i];
              subordinate_nodes.push(edge.fromId);
              subordinate_nodes.push(edge.eventualId);

              //recurse
              find_subordinate_nodes(edge.fromId);
              find_subordinate_nodes(edge.eventualId);
            }
          }
        };

        await find_subordinate_nodes(object.options.id);
        // console.log('subordinate nodes found: ', subordinate_nodes);
        for (let i = 0; i < subordinate_nodes.length; i++) {
          const node = this.body.nodes[subordinate_nodes[i]];
          // console.log('highlighting node: ', node.options.id);
          if (node) {
            this.emitHoverEvent(event, pointer, node);
          }
        }
        // only the additional highlighted nodes are in subordinate_nodes, so add the originally hovered node to the list
        subordinate_nodes.push(object.options.id);

        this.lastHoveredNodes = subordinate_nodes; // keep track of the hovered subordinate nodes, so in the next frame we can send the empty list to react if we are no longer hovering.
        // send the hoveredNodes event to the front-end
        this.body.emitter.emit("hoveredNodes", subordinate_nodes);
        hoverChanged = true;
      }
    }

    if (hoverChanged === true) {
      this.body.emitter.emit("_requestRedraw");
    }
    window.wasUserDragging = window.isUserDragging; // keep track of whether we were dragging last frame.
  }

  /**
   * Commit the selection changes but don't emit any events.
   */
  commitWithoutEmitting() {
    this._selectionAccumulator.commit();
  }

  /**
   * Select and deselect nodes depending current selection change.
   *
   * For changing nodes, select/deselect events are fired.
   *
   * NOTE: For a given edge, if one connecting node is deselected and with the
   * same click the other node is selected, no events for the edge will fire. It
   * was selected and it will remain selected.
   *
   * @param {{x: number, y: number}} pointer - The x and y coordinates of the
   * click, tap, dragend… that triggered this.
   * @param {UIEvent} event - The event that triggered this.
   */
  commitAndEmit(pointer, event) {
    let selected = false;

    const selectionChanges = this._selectionAccumulator.commit();
    const previousSelection = {
      nodes: selectionChanges.nodes.previous,
      edges: selectionChanges.edges.previous,
    };

    if (selectionChanges.edges.deleted.length > 0) {
      this.generateClickEvent(
        "deselectEdge",
        event,
        pointer,
        previousSelection
      );
      selected = true;
    }

    if (selectionChanges.nodes.deleted.length > 0) {
      this.generateClickEvent(
        "deselectNode",
        event,
        pointer,
        previousSelection
      );
      selected = true;
    }

    if (selectionChanges.nodes.added.length > 0) {
      this.generateClickEvent("selectNode", event, pointer);
      selected = true;
    }

    if (selectionChanges.edges.added.length > 0) {
      this.generateClickEvent("selectEdge", event, pointer);
      selected = true;
    }

    // fire the select event if anything has been selected or deselected
    if (selected === true) {
      // select or unselect
      this.generateClickEvent("select", event, pointer);
    }
  }

  /**
   * Retrieve the currently selected node and edge ids.
   *
   * @returns {{nodes: Array.<string>, edges: Array.<string>}} Arrays with the
   * ids of the selected nodes and edges.
   */
  getSelection() {
    return {
      nodes: this.getSelectedNodeIds(),
      edges: this.getSelectedEdgeIds(),
    };
  }

  /**
   * Retrieve the currently selected nodes.
   *
   * @returns {Array} An array with selected nodes.
   */
  getSelectedNodes() {
    return this._selectionAccumulator.getNodes();
  }

  /**
   * Retrieve the currently selected edges.
   *
   * @returns {Array} An array with selected edges.
   */
  getSelectedEdges() {
    return this._selectionAccumulator.getEdges();
  }

  /**
   * Retrieve the currently selected node ids.
   *
   * @returns {Array} An array with the ids of the selected nodes.
   */
  getSelectedNodeIds() {
    return this._selectionAccumulator.getNodes().map((node) => node.id);
  }

  /**
   * Retrieve the currently selected edge ids.
   *
   * @returns {Array} An array with the ids of the selected edges.
   */
  getSelectedEdgeIds() {
    return this._selectionAccumulator.getEdges().map((edge) => edge.id);
  }

  /**
   * Updates the current selection
   *
   * @param {{nodes: Array.<string>, edges: Array.<string>}} selection
   * @param {object} options                                 Options
   */
  setSelection(selection, options = {}) {
    if (!selection || (!selection.nodes && !selection.edges)) {
      throw new TypeError(
        "Selection must be an object with nodes and/or edges properties"
      );
    }

    // first unselect any selected node, if option is true or undefined
    if (options.unselectAll || options.unselectAll === undefined) {
      this.unselectAll();
    }
    if (selection.nodes) {
      for (const id of selection.nodes) {
        const node = this.body.nodes[id];
        if (!node) {
          throw new RangeError('Node with id "' + id + '" not found');
        }

        if (!node.isLabelNode) {
          this.selectObject(node, options.highlightEdges);
        }
      }
    }

    if (selection.edges) {
      for (const id of selection.edges) {
        const edge = this.body.edges[id];
        if (!edge) {
          throw new RangeError('Edge with id "' + id + '" not found');
        }
        this.selectObject(edge);
      }
    }
    this.body.emitter.emit("_requestRedraw");
    this._selectionAccumulator.commit();
  }

  /**
   * select zero or more nodes with the option to highlight edges
   *
   * @param {number[] | string[]} selection     An array with the ids of the
   *                                            selected nodes.
   * @param {boolean} [highlightEdges]
   */
  selectNodes(selection, highlightEdges = true) {
    if (!selection || selection.length === undefined)
      throw "Selection must be an array with ids";

    this.setSelection({ nodes: selection }, { highlightEdges: highlightEdges });
  }

  /**
   * select zero or more edges
   *
   * @param {number[] | string[]} selection     An array with the ids of the
   *                                            selected nodes.
   */
  selectEdges(selection) {
    if (!selection || selection.length === undefined)
      throw "Selection must be an array with ids";

    this.setSelection({ edges: selection });
  }

  /**
   * Validate the selection: remove ids of nodes which no longer exist
   *
   * @private
   */
  updateSelection() {
    for (const node in this._selectionAccumulator.getNodes()) {
      if (!Object.prototype.hasOwnProperty.call(this.body.nodes, node.id)) {
        this._selectionAccumulator.deleteNodes(node);
      }
    }
    for (const edge in this._selectionAccumulator.getEdges()) {
      if (!Object.prototype.hasOwnProperty.call(this.body.edges, edge.id)) {
        this._selectionAccumulator.deleteEdges(edge);
      }
    }
  }

  /**
   * Determine all the visual elements clicked which are on the given point.
   *
   * All elements are returned; this includes nodes, edges and their labels.
   * The order returned is from highest to lowest, i.e. element 0 of the return
   * value is the topmost item clicked on.
   *
   * The return value consists of an array of the following possible elements:
   *
   * - `{nodeId:number}`             - node with given id clicked on
   * - `{nodeId:number, labelId:0}`  - label of node with given id clicked on
   * - `{edgeId:number}`             - edge with given id clicked on
   * - `{edge:number, labelId:0}`    - label of edge with given id clicked on
   *
   * ## NOTES
   *
   * - Currently, there is only one label associated with a node or an edge,
   *   but this is expected to change somewhere in the future.
   * - Since there is no z-indexing yet, it is not really possible to set the nodes and
   *   edges in the correct order. For the time being, nodes come first.
   *
   * @param {point} pointer  mouse position in screen coordinates
   * @returns {Array.<nodeClickItem|nodeLabelClickItem|edgeClickItem|edgeLabelClickItem>}
   * @private
   */
  getClickedItems(pointer) {
    const point = this.canvas.DOMtoCanvas(pointer);
    const items = [];

    // Note reverse order; we want the topmost clicked items to be first in the array
    // Also note that selected nodes are disregarded here; these normally display on top
    const nodeIndices = this.body.nodeIndices;
    const nodes = this.body.nodes;
    for (let i = nodeIndices.length - 1; i >= 0; i--) {
      const node = nodes[nodeIndices[i]];
      const ret = node.getItemsOnPoint(point);
      items.push.apply(items, ret); // Append the return value to the running list.
    }

    const edgeIndices = this.body.edgeIndices;
    const edges = this.body.edges;
    for (let i = edgeIndices.length - 1; i >= 0; i--) {
      const edge = edges[edgeIndices[i]];
      const ret = edge.getItemsOnPoint(point);
      items.push.apply(items, ret); // Append the return value to the running list.
    }

    return items;
  }
}

export default SelectionHandler;
