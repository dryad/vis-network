import { EdgeBase } from "./edge-base";
import {
  EdgeFormattingValues,
  Label,
  EdgeOptions,
  Point,
  PointT,
  SelectiveRequired,
  VBody,
  VNode,
} from "./types";

/**
 * The Base Class for all Bezier edges.
 * Bezier curves are used to model smooth gradual curves in paths between nodes.
 */
export abstract class BezierEdgeBase<Via> extends EdgeBase<Via> {
  /**
   * Create a new instance.
   *
   * @param options - The options object of given edge.
   * @param body - The body of the network.
   * @param labelModule - Label module.
   */
  public constructor(options: EdgeOptions, body: VBody, labelModule: Label) {
    super(options, body, labelModule);
  }

  /**
   * Compute additional point(s) the edge passes through.
   *
   * @returns Cartesian coordinates of the point(s) the edge passes through.
   */
  protected abstract _getViaCoordinates(): Via;

  /**
   * Find the intersection between the border of the node and the edge.
   *
   * @remarks
   * This function uses binary search to look for the point where the bezier curve crosses the border of the node.
   * @param nearNode - The node (either from or to node of the edge).
   * @param ctx - The context that will be used for rendering.
   * @param viaNode - Additional node(s) the edge passes through.
   * @returns Cartesian coordinates of the intersection between the border of the node and the edge.
   */
  protected _findBorderPositionBezier(
    nearNode: VNode,
    ctx: CanvasRenderingContext2D,
    viaNode: Via = this._getViaCoordinates()
  ): PointT {
    const maxIterations = 10;
    const threshold = 0.2;
    let from = false;
    let high = 1;
    let low = 0;
    let node = this.to;
    let pos: Point;
    let middle: number;

    let endPointOffset = this.options.endPointOffset
      ? this.options.endPointOffset.to
      : 0;

    if (nearNode.id === this.from.id) {
      node = this.from;
      from = true;

      endPointOffset = this.options.endPointOffset
        ? this.options.endPointOffset.from
        : 0;
    }

    if (this.options.arrowStrikethrough === false) {
      endPointOffset = 0;
    }

    let iteration = 0;
    do {
      middle = (low + high) * 0.5;

      pos = this.getPoint(middle, viaNode);
      const angle = Math.atan2(node.y - pos.y, node.x - pos.x);

      const distanceToBorder =
        node.distanceToBorder(ctx, angle) + endPointOffset;

      const distanceToPoint = Math.sqrt(
        Math.pow(pos.x - node.x, 2) + Math.pow(pos.y - node.y, 2)
      );
      const difference = distanceToBorder - distanceToPoint;
      if (Math.abs(difference) < threshold) {
        break; // found
      } else if (difference < 0) {
        // distance to nodes is larger than distance to border --> t needs to be bigger if we're looking at the to node.
        if (from === false) {
          low = middle;
        } else {
          high = middle;
        }
      } else {
        if (from === false) {
          high = middle;
        } else {
          low = middle;
        }
      }

      ++iteration;
    } while (low <= high && iteration < maxIterations);

    return {
      ...pos,
      t: middle,
    };
  }

  /**
   * Calculate the distance between a point (x3,y3) and a line segment from (x1,y1) to (x2,y2).
   *
   * @remarks
   * http://stackoverflow.com/questions/849211/shortest-distancae-between-a-point-and-a-line-segment
   * @param x1 - First end of the line segment on the x axis.
   * @param y1 - First end of the line segment on the y axis.
   * @param x2 - Second end of the line segment on the x axis.
   * @param y2 - Second end of the line segment on the y axis.
   * @param x3 - Position of the point on the x axis.
   * @param y3 - Position of the point on the y axis.
   * @param via - The control point for the edge.
   * @returns The distance between the line segment and the point.
   */
  protected _getDistanceToBezierEdge(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    via: Point
  ): number {
    // x3,y3 is the point
    let minDistance = 1e9;
    let distance;
    let i, t, x, y;
    let lastX = x1;
    let lastY = y1;
    for (i = 1; i < 10; i++) {
      t = 0.1 * i;
      x =
        Math.pow(1 - t, 2) * x1 + 2 * t * (1 - t) * via.x + Math.pow(t, 2) * x2;
      y =
        Math.pow(1 - t, 2) * y1 + 2 * t * (1 - t) * via.y + Math.pow(t, 2) * y2;
      if (i > 0) {
        distance = this._getDistanceToLine(lastX, lastY, x, y, x3, y3);
        minDistance = distance < minDistance ? distance : minDistance;
      }
      lastX = x;
      lastY = y;
    }

    return minDistance;
  }

  /**
   * Render a bezier curve between two nodes.
   *
   * @remarks
   * The method accepts zero, one or two control points.
   * Passing zero control points just draws a straight line.
   * @param ctx - The context that will be used for rendering.
   * @param values - Style options for edge drawing.
   * @param viaNode1 - First control point for curve drawing.
   * @param viaNode2 - Second control point for curve drawing.
   */
  protected _bezierCurve(
    ctx: CanvasRenderingContext2D,
    values: SelectiveRequired<
      EdgeFormattingValues,
      | "backgroundColor"
      | "backgroundSize"
      | "shadowColor"
      | "shadowSize"
      | "shadowX"
      | "shadowY"
    >,
    viaNode1?: Point,
    viaNode2?: Point
  ): void {
    ctx.beginPath();
    ctx.moveTo(this.fromPoint.x, this.fromPoint.y);

    if (viaNode1 != null && viaNode1.x != null) {
      if (viaNode2 != null && viaNode2.x != null) {
        ctx.bezierCurveTo(
          viaNode1.x,
          viaNode1.y,
          viaNode2.x,
          viaNode2.y,
          this.toPoint.x,
          this.toPoint.y
        );
      } else {
        // console.log('this', this)
        // console.log('from', this.fromPoint);
        // console.log('to', this.toPoint);

        if (this.toPoint && this.eventualPoint == null) {
          // unary edge (replaced loops, between 2 nodes only)
          ctx.lineTo(this.toPoint.x, this.toPoint.y);
          ctx.stroke();
          const angle = getAngle(
            this.fromPoint.x,
            this.fromPoint.y,
            this.toPoint.x,
            this.toPoint.y
          );
          const [arrowx, arrowy] = percentPointOnLine(
            this.fromPoint.x,
            this.fromPoint.y,
            this.toPoint.x,
            this.toPoint.y,
            0.9
          );
          drawArrow(ctx, arrowx, arrowy, angle);
        } else if (this.eventualPoint) {
          // standard edge (between two nodes, creates middle node)
          // original
          // ctx.quadraticCurveTo(
          //   viaNode1.x,
          //   viaNode1.y,
          //   this.toPoint.x,
          //   this.toPoint.y
          // );
          const [ct1x, ct1y, ct2x, ct2y] = getControlPoints(
            this.fromPoint.x,
            this.fromPoint.y,
            this.toPoint.x,
            this.toPoint.y,
            this.eventualPoint.x,
            this.eventualPoint.y,
            0.5
          );

          ctx.quadraticCurveTo(ct1x, ct1y, this.toPoint.x, this.toPoint.y);
          ctx.stroke();
          ctx.quadraticCurveTo(
            ct2x,
            ct2y,
            this.eventualPoint.x,
            this.eventualPoint.y
          );
          ctx.stroke();

          // Uncomment to see Control points
          // ctx.fillStyle = 'red';
          // ctx.beginPath();
          // ctx.arc(ct1x, ct1y, 5, 0, 2 * Math.PI);  // Control point one
          // ctx.arc(ct2x, ct2y, 5, 0, 2 * Math.PI);  // Control point two
          // ctx.fill();

          // using last leg of curve (toPoint -> ct2 -> eventualPoint)
          const [arrow0x, arrow0y] = getArrowPoint3(
            this.toPoint.x,
            this.toPoint.y,
            ct2x,
            ct2y,
            this.eventualPoint.x,
            this.eventualPoint.y,
            0.93
          );
          const [arrow1x, arrow1y] = getArrowPoint3(
            this.toPoint.x,
            this.toPoint.y,
            ct2x,
            ct2y,
            this.eventualPoint.x,
            this.eventualPoint.y,
            0.95
          );

          // using all points of curve (fromPoint -> ct1 -> toPoint -> ct2 -> eventualPoint)
          //arrow0 is off center a little bit ?
          // const [arrow0x, arrow0y] = getArrowPoint5(
          //   this.fromPoint.x,
          //   this.fromPoint.y,
          //   ct1x,
          //   ct1y,
          //   this.toPoint.x,
          //   this.toPoint.y,
          //   ct2x,
          //   ct2y,
          //   this.eventualPoint.x,
          //   this.eventualPoint.y,
          //   0.95
          // );

          // const [arrow1x, arrow1y] = getArrowPoint5(
          //   this.fromPoint.x,
          //   this.fromPoint.y,
          //   ct1x,
          //   ct1y,
          //   this.toPoint.x,
          //   this.toPoint.y,
          //   ct2x,
          //   ct2y,
          //   this.eventualPoint.x,
          //   this.eventualPoint.y,
          //   0.97
          // );

          //get angle from arrow0 to arrow1
          const angle = getAngle(arrow0x, arrow0y, arrow1x, arrow1y);
          //console.log('arrow angle', angle);

          //temp arrow location marker (shows us where the second point is for calculating the angle)
          // ctx.fillStyle = 'red';
          // ctx.beginPath();
          //  ctx.arc(arrow0x, arrow0y, 5, 0, 2 * Math.PI);  // Control point one
          // // ctx.arc(ct2x, ct2y, 5, 0, 2 * Math.PI);  // Control point two
          // ctx.fill();

          drawArrow(ctx, arrow1x, arrow1y, angle);
        }
      }
    } else {
      // fallback to normal straight edge
      ctx.lineTo(this.toPoint.x, this.toPoint.y);
    }

    // draw a background
    this.drawBackground(ctx, values);

    // draw shadow if enabled
    this.enableShadow(ctx, values);
    ctx.stroke();
    this.disableShadow(ctx, values);
  }

  /** @inheritDoc */
  public getViaNode(): Via {
    return this._getViaCoordinates();
  }
}

// http://scaledinnovation.com/analytics/splines/splines.html
/**
 * @param x0
 * @param y0
 * @param x1
 * @param y1
 * @param x2
 * @param y2
 * @param t
 */
function getControlPoints(x0, y0, x1, y1, x2, y2, t) {
  const d01 = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2));
  const d12 = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  const fa = (t * d01) / (d01 + d12); // scaling factor for triangle Ta
  const fb = (t * d12) / (d01 + d12); // ditto for Tb, simplifies to fb=t-fa
  const p1x = x1 - fa * (x2 - x0); // x2-x0 is the width of triangle T
  const p1y = y1 - fa * (y2 - y0); // y2-y0 is the height of T
  const p2x = x1 + fb * (x2 - x0);
  const p2y = y1 + fb * (y2 - y0);
  return [p1x, p1y, p2x, p2y];
}

/**
 * @param p0x
 * @param p0y
 * @param p1x
 * @param p1y
 * @param p2x
 * @param p2y
 * @param t
 */

/**
 * @param p0x
 * @param p0y
 * @param p1x
 * @param p1y
 * @param p2x
 * @param p2y
 * @param t
 */
function getArrowPoint3(p0x, p0y, p1x, p1y, p2x, p2y, t) {
  //x = (1 - t) * (1 - t) * p[0].x + 2 * (1 - t) * t * p[1].x + t * t * p[2].x;
  //y = (1 - t) * (1 - t) * p[0].y + 2 * (1 - t) * t * p[1].y + t * t * p[2].y;
  const arrow_x = (1 - t) * (1 - t) * p0x + 2 * (1 - t) * t * p1x + t * t * p2x;
  const arrow_y = (1 - t) * (1 - t) * p0y + 2 * (1 - t) * t * p1y + t * t * p2y;
  return [arrow_x, arrow_y];
}

/**
 * @param p0x
 * @param p0y
 * @param p1x
 * @param p1y
 * @param p2x
 * @param p2y
 * @param p3x
 * @param p3y
 * @param p4x
 * @param p4y
 * @param t
 */
function getArrowPoint5(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y, t) {
  //x = (1-t)*(1-t)*(1-t)*p0x + 3*(1-t)*(1-t)*t*p1x + 3*(1-t)*t*t*p2x + t*t*t*p3x;
  //y = (1-t)*(1-t)*(1-t)*p0y + 3*(1-t)*(1-t)*t*p1y + 3*(1-t)*t*t*p2y + t*t*t*p3y;
  const arrow_x =
    (1 - t) * (1 - t) * (1 - t) * (1 - t) * p0x +
    4 * (1 - t) * (1 - t) * (1 - t) * t * p1x +
    4 * (1 - t) * (1 - t) * t * p2x +
    4 * (1 - t) * t * p3x +
    t * t * t * t * p4x;
  const arrow_y =
    (1 - t) * (1 - t) * (1 - t) * (1 - t) * p0y +
    4 * (1 - t) * (1 - t) * (1 - t) * t * p1y +
    4 * (1 - t) * (1 - t) * t * p2y +
    4 * (1 - t) * t * p3y +
    t * t * t * t * p4y;
  return [arrow_x, arrow_y];
}

/**
 * @param p0x
 * @param p0y
 * @param p1x
 * @param p1y
 */
function getAngle(p0x, p0y, p1x, p1y) {
  //return Math.atan2(p1y - p0y, p1x - p0x) * 180 / Math.PI;
  return Math.atan2(p1y - p0y, p1x - p0x);
}

/**
 * @param ctx
 * @param x
 * @param y
 * @param angle
 */
function drawArrow(ctx, x, y, angle) {
  const points = [
    // arrow shape
    { x: 0, y: 0 },
    { x: -1, y: 0.3 },
    { x: -0.9, y: 0 },
    { x: -1, y: -0.3 },
  ];
  const transformed_points = transformArrow(points, x, y, angle);
  drawPath(ctx, transformed_points);
}

/**
 * @param ctx
 * @param points
 */
function drawPath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; ++i) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * @param points
 * @param x
 * @param y
 * @param angle
 */
function transformArrow(points, x, y, angle) {
  if (!Array.isArray(points)) {
    points = [points];
  }
  const length = 18; // from edge-base.ts: const length = 15 * scaleFactor + 3 * lineWidth; // 3* lineWidth is the width of the edge.

  for (let i = 0; i < points.length; ++i) {
    const p = points[i];
    const xt = p.x * Math.cos(angle) - p.y * Math.sin(angle);
    const yt = p.x * Math.sin(angle) + p.y * Math.cos(angle);

    p.x = x + length * xt;
    p.y = y + length * yt;
  }
  return points;
}

/**
 * @param x1
 * @param y1
 * @param x2
 * @param y2
 * @param per
 */
function percentPointOnLine(x1, y1, x2, y2, per) {
  return [x1 + (x2 - x1) * per, y1 + (y2 - y1) * per];
}
// /**
//  * Get a point on a circle
//  *
//  * @param {number} x
//  * @param {number} y
//  * @param {number} radius
//  * @param {number} angle
//  * @returns {object} point
//  * @private
//  */
//  _pointOnCircle(x, y, radius, angle) {
//   return {
//     x: x + radius * Math.cos(angle),
//     y: y - radius * Math.sin(angle),
//   };
// }
