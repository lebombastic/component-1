// New Block - Updated July 30, 2025
function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
let src_url_equal_anchor;
function src_url_equal(element_src, url) {
    if (!src_url_equal_anchor) {
        src_url_equal_anchor = document.createElement('a');
    }
    src_url_equal_anchor.href = url;
    return element_src === src_url_equal_anchor.href;
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function to_number(value) {
    return value === '' ? null : +value;
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}
function set_input_value(input, value) {
    input.value = value == null ? '' : value;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

/* generated by Svelte v3.59.1 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[26] = list[i];
	child_ctx[28] = i;
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[26] = list[i];
	return child_ctx;
}

// (220:4) {#each videos as video}
function create_each_block_1(ctx) {
	let li;
	let img;
	let img_src_value;
	let img_alt_value;
	let t0;
	let span;
	let t1_value = /*video*/ ctx[26].title + "";
	let t1;
	let t2;
	let t3_value = /*video*/ ctx[26].channel + "";
	let t3;
	let t4;
	let button;
	let t5;
	let t6;
	let mounted;
	let dispose;

	function click_handler() {
		return /*click_handler*/ ctx[18](/*video*/ ctx[26]);
	}

	return {
		c() {
			li = element("li");
			img = element("img");
			t0 = space();
			span = element("span");
			t1 = text(t1_value);
			t2 = text(" by ");
			t3 = text(t3_value);
			t4 = space();
			button = element("button");
			t5 = text("Add to Playlist");
			t6 = space();
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			img = claim_element(li_nodes, "IMG", { src: true, alt: true, class: true });
			t0 = claim_space(li_nodes);
			span = claim_element(li_nodes, "SPAN", {});
			var span_nodes = children(span);
			t1 = claim_text(span_nodes, t1_value);
			t2 = claim_text(span_nodes, " by ");
			t3 = claim_text(span_nodes, t3_value);
			span_nodes.forEach(detach);
			t4 = claim_space(li_nodes);
			button = claim_element(li_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t5 = claim_text(button_nodes, "Add to Playlist");
			button_nodes.forEach(detach);
			t6 = claim_space(li_nodes);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			if (!src_url_equal(img.src, img_src_value = /*video*/ ctx[26].thumbnail)) attr(img, "src", img_src_value);
			attr(img, "alt", img_alt_value = /*video*/ ctx[26].title);
			attr(img, "class", "svelte-1godyj2");
			attr(button, "class", "svelte-1godyj2");
			attr(li, "class", "svelte-1godyj2");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, img);
			append_hydration(li, t0);
			append_hydration(li, span);
			append_hydration(span, t1);
			append_hydration(span, t2);
			append_hydration(span, t3);
			append_hydration(li, t4);
			append_hydration(li, button);
			append_hydration(button, t5);
			append_hydration(li, t6);

			if (!mounted) {
				dispose = listen(button, "click", click_handler);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty & /*videos*/ 4 && !src_url_equal(img.src, img_src_value = /*video*/ ctx[26].thumbnail)) {
				attr(img, "src", img_src_value);
			}

			if (dirty & /*videos*/ 4 && img_alt_value !== (img_alt_value = /*video*/ ctx[26].title)) {
				attr(img, "alt", img_alt_value);
			}

			if (dirty & /*videos*/ 4 && t1_value !== (t1_value = /*video*/ ctx[26].title + "")) set_data(t1, t1_value);
			if (dirty & /*videos*/ 4 && t3_value !== (t3_value = /*video*/ ctx[26].channel + "")) set_data(t3, t3_value);
		},
		d(detaching) {
			if (detaching) detach(li);
			mounted = false;
			dispose();
		}
	};
}

// (229:4) {#each playlist as video, index}
function create_each_block(ctx) {
	let li;
	let img;
	let img_src_value;
	let img_alt_value;
	let t0;
	let span;
	let t1_value = /*video*/ ctx[26].title + "";
	let t1;
	let t2;
	let t3_value = /*video*/ ctx[26].channel + "";
	let t3;
	let t4;
	let button;
	let t5;
	let t6;
	let mounted;
	let dispose;

	function click_handler_1() {
		return /*click_handler_1*/ ctx[19](/*index*/ ctx[28]);
	}

	return {
		c() {
			li = element("li");
			img = element("img");
			t0 = space();
			span = element("span");
			t1 = text(t1_value);
			t2 = text(" by ");
			t3 = text(t3_value);
			t4 = space();
			button = element("button");
			t5 = text("Remove");
			t6 = space();
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			img = claim_element(li_nodes, "IMG", { src: true, alt: true, class: true });
			t0 = claim_space(li_nodes);
			span = claim_element(li_nodes, "SPAN", {});
			var span_nodes = children(span);
			t1 = claim_text(span_nodes, t1_value);
			t2 = claim_text(span_nodes, " by ");
			t3 = claim_text(span_nodes, t3_value);
			span_nodes.forEach(detach);
			t4 = claim_space(li_nodes);
			button = claim_element(li_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t5 = claim_text(button_nodes, "Remove");
			button_nodes.forEach(detach);
			t6 = claim_space(li_nodes);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			if (!src_url_equal(img.src, img_src_value = /*video*/ ctx[26].thumbnail)) attr(img, "src", img_src_value);
			attr(img, "alt", img_alt_value = /*video*/ ctx[26].title);
			attr(img, "class", "svelte-1godyj2");
			attr(button, "class", "svelte-1godyj2");
			attr(li, "class", "svelte-1godyj2");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, img);
			append_hydration(li, t0);
			append_hydration(li, span);
			append_hydration(span, t1);
			append_hydration(span, t2);
			append_hydration(span, t3);
			append_hydration(li, t4);
			append_hydration(li, button);
			append_hydration(button, t5);
			append_hydration(li, t6);

			if (!mounted) {
				dispose = listen(button, "click", click_handler_1);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty & /*playlist*/ 8 && !src_url_equal(img.src, img_src_value = /*video*/ ctx[26].thumbnail)) {
				attr(img, "src", img_src_value);
			}

			if (dirty & /*playlist*/ 8 && img_alt_value !== (img_alt_value = /*video*/ ctx[26].title)) {
				attr(img, "alt", img_alt_value);
			}

			if (dirty & /*playlist*/ 8 && t1_value !== (t1_value = /*video*/ ctx[26].title + "")) set_data(t1, t1_value);
			if (dirty & /*playlist*/ 8 && t3_value !== (t3_value = /*video*/ ctx[26].channel + "")) set_data(t3, t3_value);
		},
		d(detaching) {
			if (detaching) detach(li);
			mounted = false;
			dispose();
		}
	};
}

function create_fragment(ctx) {
	let main;
	let h1;
	let t0;
	let t1;
	let input0;
	let t2;
	let button0;
	let t3;
	let t4;
	let input1;
	let t5;
	let ul0;
	let t6;
	let ul1;
	let t7;
	let div0;
	let t8;
	let div3;
	let img;
	let img_src_value;
	let img_alt_value;
	let t9;
	let div1;
	let span0;
	let t10_value = /*tracks*/ ctx[7][current_track].title + "";
	let t10;
	let t11;
	let span1;
	let t12_value = /*tracks*/ ctx[7][/*currentTrack*/ ctx[4]].artist + "";
	let t12;
	let t13;
	let div2;
	let button1;
	let t14;
	let t15;
	let button2;
	let t16_value = (/*isPlaying*/ ctx[5] ? '❚❚' : '▶') + "";
	let t16;
	let t17;
	let button3;
	let t18;
	let t19;
	let input2;
	let mounted;
	let dispose;
	let each_value_1 = /*videos*/ ctx[2];
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	let each_value = /*playlist*/ ctx[3];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			main = element("main");
			h1 = element("h1");
			t0 = text("YouTube Music Player");
			t1 = space();
			input0 = element("input");
			t2 = space();
			button0 = element("button");
			t3 = text("Save API Key");
			t4 = space();
			input1 = element("input");
			t5 = space();
			ul0 = element("ul");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t6 = space();
			ul1 = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t7 = space();
			div0 = element("div");
			t8 = space();
			div3 = element("div");
			img = element("img");
			t9 = space();
			div1 = element("div");
			span0 = element("span");
			t10 = text(t10_value);
			t11 = space();
			span1 = element("span");
			t12 = text(t12_value);
			t13 = space();
			div2 = element("div");
			button1 = element("button");
			t14 = text("‹");
			t15 = space();
			button2 = element("button");
			t16 = text(t16_value);
			t17 = space();
			button3 = element("button");
			t18 = text("›");
			t19 = space();
			input2 = element("input");
			this.h();
		},
		l(nodes) {
			main = claim_element(nodes, "MAIN", { class: true });
			var main_nodes = children(main);
			h1 = claim_element(main_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "YouTube Music Player");
			h1_nodes.forEach(detach);
			t1 = claim_space(main_nodes);

			input0 = claim_element(main_nodes, "INPUT", {
				type: true,
				placeholder: true,
				class: true
			});

			t2 = claim_space(main_nodes);
			button0 = claim_element(main_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t3 = claim_text(button0_nodes, "Save API Key");
			button0_nodes.forEach(detach);
			t4 = claim_space(main_nodes);

			input1 = claim_element(main_nodes, "INPUT", {
				type: true,
				placeholder: true,
				class: true
			});

			t5 = claim_space(main_nodes);
			ul0 = claim_element(main_nodes, "UL", { class: true });
			var ul0_nodes = children(ul0);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].l(ul0_nodes);
			}

			ul0_nodes.forEach(detach);
			t6 = claim_space(main_nodes);
			ul1 = claim_element(main_nodes, "UL", { class: true });
			var ul1_nodes = children(ul1);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul1_nodes);
			}

			ul1_nodes.forEach(detach);
			t7 = claim_space(main_nodes);
			div0 = claim_element(main_nodes, "DIV", { id: true, class: true });
			children(div0).forEach(detach);
			t8 = claim_space(main_nodes);
			div3 = claim_element(main_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);

			img = claim_element(div3_nodes, "IMG", {
				src: true,
				alt: true,
				width: true,
				height: true
			});

			t9 = claim_space(div3_nodes);
			div1 = claim_element(div3_nodes, "DIV", {});
			var div1_nodes = children(div1);
			span0 = claim_element(div1_nodes, "SPAN", {});
			var span0_nodes = children(span0);
			t10 = claim_text(span0_nodes, t10_value);
			span0_nodes.forEach(detach);
			t11 = claim_space(div1_nodes);
			span1 = claim_element(div1_nodes, "SPAN", {});
			var span1_nodes = children(span1);
			t12 = claim_text(span1_nodes, t12_value);
			span1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t13 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			button1 = claim_element(div2_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t14 = claim_text(button1_nodes, "‹");
			button1_nodes.forEach(detach);
			t15 = claim_space(div2_nodes);
			button2 = claim_element(div2_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);
			t16 = claim_text(button2_nodes, t16_value);
			button2_nodes.forEach(detach);
			t17 = claim_space(div2_nodes);
			button3 = claim_element(div2_nodes, "BUTTON", { class: true });
			var button3_nodes = children(button3);
			t18 = claim_text(button3_nodes, "›");
			button3_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t19 = claim_space(div3_nodes);

			input2 = claim_element(div3_nodes, "INPUT", {
				type: true,
				min: true,
				max: true,
				class: true
			});

			div3_nodes.forEach(detach);
			main_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "svelte-1godyj2");
			attr(input0, "type", "text");
			attr(input0, "placeholder", "Enter your YouTube API key");
			attr(input0, "class", "svelte-1godyj2");
			attr(button0, "class", "svelte-1godyj2");
			attr(input1, "type", "search");
			attr(input1, "placeholder", "Search YouTube videos...");
			attr(input1, "class", "svelte-1godyj2");
			attr(ul0, "class", "svelte-1godyj2");
			attr(ul1, "class", "svelte-1godyj2");
			attr(div0, "id", "player");
			attr(div0, "class", "svelte-1godyj2");
			if (!src_url_equal(img.src, img_src_value = /*tracks*/ ctx[7][/*currentTrack*/ ctx[4]].thumbnail)) attr(img, "src", img_src_value);
			attr(img, "alt", img_alt_value = /*tracks*/ ctx[7][/*currentTrack*/ ctx[4]].title);
			attr(img, "width", "40");
			attr(img, "height", "40");
			attr(button1, "class", "svelte-1godyj2");
			attr(button2, "class", "svelte-1godyj2");
			attr(button3, "class", "svelte-1godyj2");
			attr(div2, "class", "player-controls svelte-1godyj2");
			attr(input2, "type", "range");
			attr(input2, "min", "0");
			attr(input2, "max", "100");
			attr(input2, "class", "svelte-1godyj2");
			attr(div3, "class", "player-area svelte-1godyj2");
			attr(main, "class", "svelte-1godyj2");
		},
		m(target, anchor) {
			insert_hydration(target, main, anchor);
			append_hydration(main, h1);
			append_hydration(h1, t0);
			append_hydration(main, t1);
			append_hydration(main, input0);
			set_input_value(input0, /*apiKey*/ ctx[0]);
			append_hydration(main, t2);
			append_hydration(main, button0);
			append_hydration(button0, t3);
			append_hydration(main, t4);
			append_hydration(main, input1);
			set_input_value(input1, /*searchQuery*/ ctx[1]);
			append_hydration(main, t5);
			append_hydration(main, ul0);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(ul0, null);
				}
			}

			append_hydration(main, t6);
			append_hydration(main, ul1);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul1, null);
				}
			}

			append_hydration(main, t7);
			append_hydration(main, div0);
			append_hydration(main, t8);
			append_hydration(main, div3);
			append_hydration(div3, img);
			append_hydration(div3, t9);
			append_hydration(div3, div1);
			append_hydration(div1, span0);
			append_hydration(span0, t10);
			append_hydration(div1, t11);
			append_hydration(div1, span1);
			append_hydration(span1, t12);
			append_hydration(div3, t13);
			append_hydration(div3, div2);
			append_hydration(div2, button1);
			append_hydration(button1, t14);
			append_hydration(div2, t15);
			append_hydration(div2, button2);
			append_hydration(button2, t16);
			append_hydration(div2, t17);
			append_hydration(div2, button3);
			append_hydration(button3, t18);
			append_hydration(div3, t19);
			append_hydration(div3, input2);
			set_input_value(input2, /*volume*/ ctx[6]);

			if (!mounted) {
				dispose = [
					listen(input0, "input", /*input0_input_handler*/ ctx[16]),
					listen(button0, "click", /*saveApiKey*/ ctx[9]),
					listen(input1, "input", /*input1_input_handler*/ ctx[17]),
					listen(input1, "input", /*searchVideos*/ ctx[8]),
					listen(button1, "click", /*skipPrevious*/ ctx[14]),
					listen(button2, "click", /*playPause*/ ctx[12]),
					listen(button3, "click", /*skipNext*/ ctx[13]),
					listen(input2, "change", /*input2_change_input_handler*/ ctx[20]),
					listen(input2, "input", /*input2_change_input_handler*/ ctx[20]),
					listen(input2, "input", updateVolume)
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*apiKey*/ 1 && input0.value !== /*apiKey*/ ctx[0]) {
				set_input_value(input0, /*apiKey*/ ctx[0]);
			}

			if (dirty & /*searchQuery*/ 2 && input1.value !== /*searchQuery*/ ctx[1]) {
				set_input_value(input1, /*searchQuery*/ ctx[1]);
			}

			if (dirty & /*addVideo, videos*/ 1028) {
				each_value_1 = /*videos*/ ctx[2];
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_1(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(ul0, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_1.length;
			}

			if (dirty & /*removeVideo, playlist*/ 2056) {
				each_value = /*playlist*/ ctx[3];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(ul1, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if (dirty & /*currentTrack*/ 16 && !src_url_equal(img.src, img_src_value = /*tracks*/ ctx[7][/*currentTrack*/ ctx[4]].thumbnail)) {
				attr(img, "src", img_src_value);
			}

			if (dirty & /*currentTrack*/ 16 && img_alt_value !== (img_alt_value = /*tracks*/ ctx[7][/*currentTrack*/ ctx[4]].title)) {
				attr(img, "alt", img_alt_value);
			}

			if (dirty & /*currentTrack*/ 16 && t12_value !== (t12_value = /*tracks*/ ctx[7][/*currentTrack*/ ctx[4]].artist + "")) set_data(t12, t12_value);
			if (dirty & /*isPlaying*/ 32 && t16_value !== (t16_value = (/*isPlaying*/ ctx[5] ? '❚❚' : '▶') + "")) set_data(t16, t16_value);

			if (dirty & /*volume*/ 64) {
				set_input_value(input2, /*volume*/ ctx[6]);
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(main);
			destroy_each(each_blocks_1, detaching);
			destroy_each(each_blocks, detaching);
			mounted = false;
			run_all(dispose);
		}
	};
}

let current_track = 0;

// Update volume
function updateVolume() {
	
} // Update volume here if needed

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;

	// Import YouTube IFrame Player API
	const tag = document.createElement('script');

	tag.src = 'https://www.youtube.com/iframe_api';
	document.head.appendChild(tag);

	// Initialize variables
	let apiKey = localStorage.getItem('apiKey') || '';

	let searchQuery = '';
	let videos = [];

	let playlist = JSON.parse(localStorage.getItem('playlist')) || [
		{
			title: 'Example Video 1',
			channel: 'Example Channel 1',
			id: 'VIDEO_ID_1',
			thumbnail: 'THUMBNAIL_URL_1',
			duration: 'DURATION_1'
		},
		{
			title: 'Example Video 2',
			channel: 'Example Channel 2',
			id: 'VIDEO_ID_2',
			thumbnail: 'THUMBNAIL_URL_2',
			duration: 'DURATION_2'
		},
		{
			title: 'Example Video 3',
			channel: 'Example Channel 3',
			id: 'VIDEO_ID_3',
			thumbnail: 'THUMBNAIL_URL_3',
			duration: 'DURATION_3'
		}
	];

	let tracks = [
		{
			title: 'Track 1',
			artist: 'Artist 1',
			thumbnail: 'https://via.placeholder.com/100'
		},
		{
			title: 'Track 2',
			artist: 'Artist 2',
			thumbnail: 'https://via.placeholder.com/100'
		},
		{
			title: 'Track 3',
			artist: 'Artist 3',
			thumbnail: 'https://via.placeholder.com/100'
		}
	];

	let currentVideo = 0;
	let player;
	let currentTrack = 0;
	let isPlaying;
	let volume = 100;

	// Update player volume
	// function updateVolume() {
	//   if (player) {
	//     player.setVolume(volume);
	//   }
	// }
	// YouTube API search function
	async function searchVideos() {
		if (!apiKey) {
			alert('Please enter your YouTube API key');
			return;
		}

		const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&maxResults=10&type=video&key=${apiKey}`);
		const data = await response.json();

		$$invalidate(2, videos = data.items.map(item => ({
			title: item.snippet.title,
			channel: item.snippet.channelTitle,
			id: item.id.videoId,
			thumbnail: item.snippet.thumbnails.default.url,
			duration: 'Unknown', // YouTube API doesn't provide duration in search results
			
		})));
	}

	// Save API key to Local Storage
	function saveApiKey() {
		localStorage.setItem('apiKey', apiKey);
	}

	// Add video to playlist
	function addVideo(video) {
		$$invalidate(3, playlist = [...playlist, video]);
		localStorage.setItem('playlist', JSON.stringify(playlist));
	}

	// Remove video from playlist
	function removeVideo(index) {
		$$invalidate(3, playlist = playlist.filter((_, i) => i !== index));
		localStorage.setItem('playlist', JSON.stringify(playlist));
	}

	// YouTube IFrame Player API callback
	window.onYouTubeIframeAPIReady = () => {
		player = new YT.Player('player',
		{
				videoId: playlist[currentVideo].id,
				playerVars: { autoplay: 1, controls: 0 },
				events: {
					onStateChange: event => {
						event.data;

						if (event.data === YT.PlayerState.ENDED) {
							currentVideo = (currentVideo + 1) % playlist.length;
							player.loadVideoById(playlist[currentVideo].id);
						}
					}
				}
			});
	};

	// Playback controls
	function playPause() {
		$$invalidate(5, isPlaying = !isPlaying);
	}

	function skipNext() {
		$$invalidate(4, currentTrack = (currentTrack + 1) % tracks.length);
	}

	function skipPrevious() {
		$$invalidate(4, currentTrack = (currentTrack - 1 + tracks.length) % tracks.length);
	}

	function input0_input_handler() {
		apiKey = this.value;
		$$invalidate(0, apiKey);
	}

	function input1_input_handler() {
		searchQuery = this.value;
		$$invalidate(1, searchQuery);
	}

	const click_handler = video => addVideo(video);
	const click_handler_1 = index => removeVideo(index);

	function input2_change_input_handler() {
		volume = to_number(this.value);
		$$invalidate(6, volume);
	}

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(15, props = $$props.props);
	};

	return [
		apiKey,
		searchQuery,
		videos,
		playlist,
		currentTrack,
		isPlaying,
		volume,
		tracks,
		searchVideos,
		saveApiKey,
		addVideo,
		removeVideo,
		playPause,
		skipNext,
		skipPrevious,
		props,
		input0_input_handler,
		input1_input_handler,
		click_handler,
		click_handler_1,
		input2_change_input_handler
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 15 });
	}
}

export { Component as default };
