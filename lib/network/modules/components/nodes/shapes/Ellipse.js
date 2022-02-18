"use strict";

import NodeBase from "../util/NodeBase";
// import { drawEllipse } from "../util/shapes";
import { drawRoundRect } from "../util/shapes";
/**
 * Am Ellipse Node/Cluster shape.
 *
 * @augments NodeBase
 */
class Ellipse extends NodeBase {
  /**
   * @param {object} options
   * @param {object} body
   * @param {Label} labelModule
   */
  constructor(options, body, labelModule) {
    super(options, body, labelModule);
  }

  /**
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {boolean} [selected]
   * @param {boolean} [hover]
   */
  resize(ctx, selected = this.selected, hover = this.hover) {
    if (this.needsRefresh(selected, hover)) {
      const dimensions = this.getDimensionsFromLabel(ctx, selected, hover);

      this.height = dimensions.height * 2;
      this.width = dimensions.width + dimensions.height;
      //this.height = 10;
      //this.width = 10;
      this.radius = 0.5 * this.width;
    }
  }

  /**
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x width
   * @param {number} y height
   * @param {boolean} selected
   * @param {boolean} hover
   * @param {ArrowOptions} values
   */
  draw(ctx, x, y, selected, hover, values) {
    // console.log('Ellipse', this.options.isLabelNode, x ,y);
    if (this.options.isLabelNode == true) {
      // find the node the label belongs to
      const node = this.body.nodes[this.options.labelOfNode];

      //set the position of the labelNode relative to the node
      if (node !== undefined) {
        x = node.x + x;
        y = node.y + y;
      }
      // console.log('labelnode x/y', x, y);
    }
    this.resize(ctx, selected, hover);
    this.left = x - this.width * 0.5;
    this.top = y - this.height * 0.5;

    // if the node is selected, and the label is blank, we will show the shape of the labelNode
    if (this.body.nodes[this.options.labelOfNode].selected) {
      if (this.options.label == undefined || this.options.label == "") {
        this.initContextForDraw(ctx, values);
        // drawEllipse(ctx, this.left, this.top, this.width, this.height);
        drawRoundRect(ctx, this.left, this.top, this.width, this.height, 2);
        ctx.stroke();
        //this.performFill(ctx, values);
      }
    }

    this.updateBoundingBox(x, y, ctx, selected, hover);
    this.labelModule.draw(ctx, x, y, selected, hover);
  }

  /**
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} angle
   * @returns {number}
   */
  distanceToBorder(ctx, angle) {
    if (ctx) {
      this.resize(ctx);
    }
    const a = this.width * 0.5;
    const b = this.height * 0.5;
    const w = Math.sin(angle) * a;
    const h = Math.cos(angle) * b;
    return (a * b) / Math.sqrt(w * w + h * h);
  }
}

export default Ellipse;
