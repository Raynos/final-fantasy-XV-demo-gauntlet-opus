/**
 * Guards for the Web Audio node graph.
 *
 * A voice is assembled from a mixed list of nodes -- oscillators, buffer
 * sources, filters, gains -- and the code then feature-tests each one: "detune
 * it if it can be detuned, stop it if it can be stopped". `AudioNode` declares
 * neither, so those reads need narrowing rather than a cast.
 */

/** A node that can be scheduled to stop: an oscillator or a buffer source. */
export const canStop = (n: AudioNode): n is AudioScheduledSourceNode => 'stop' in n;

/** A node with a `detune` param the vibrato bus can drive. */
export const canDetune = (n: AudioNode): n is OscillatorNode | AudioBufferSourceNode | BiquadFilterNode =>
  'detune' in n;
