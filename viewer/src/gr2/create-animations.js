import * as THREE from "three";

/**
 * A decoded curve (reader must be configured with `decompressCurves: true`)
 * exposes flat `knots`/`controls`/`dimension` regardless of its original
 * Granny curve `format`. Curves the decoder could not decode carry an
 * `error` field instead and are skipped.
 */
function sampleCurve(curve)
{
    if (!curve || curve.error || !curve.knots?.length || !curve.controls?.length) return null;
    return { times: curve.knots, values: curve.controls, dimension: curve.dimension };
}

function toTimesArray(times)
{
    return times instanceof Float32Array ? times : new Float32Array(times);
}

function toValuesArray(values)
{
    return values instanceof Float32Array ? values : new Float32Array(values);
}

/**
 * `scaleShear` is a row-major 3x3 matrix per keyframe; Three.js scale
 * tracks only support axis-aligned scale, so shear (off-diagonal) terms
 * are dropped rather than approximated.
 */
function scaleCurveToVector3Track(curve, name)
{
    const sample = sampleCurve(curve);
    if (!sample || sample.dimension !== 9) return null;

    const times = sample.times;
    const values = new Float32Array(times.length * 3);
    for (let i = 0; i < times.length; i++)
    {
        values[i * 3] = sample.values[i * 9];
        values[i * 3 + 1] = sample.values[i * 9 + 4];
        values[i * 3 + 2] = sample.values[i * 9 + 8];
    }

    return new THREE.VectorKeyframeTrack(name, toTimesArray(times), values);
}

/**
 * Build Three.js `AnimationClip`s from GR2 `Animation` records. Tracks
 * target bone-name-qualified properties (`"<boneName>.position"`, etc.) so
 * `AnimationMixer` binds them by scene-graph name; tracks referencing a
 * bone the target skeleton does not have are skipped.
 *
 * @param {object[]} animations `gr2.animations`.
 * @param {(boneName: string) => boolean} hasBone Membership test against
 *   the skeleton the clip will be played on.
 * @returns {THREE.AnimationClip[]}
 */
export function createAnimationClips(animations, hasBone)
{
    const clips = [];

    for (const animation of animations)
    {
        const tracks = [];

        for (const trackGroup of animation.trackGroups)
        {
            for (const transformTrack of trackGroup.transformTracks)
            {
                if (!hasBone(transformTrack.name)) continue;

                const position = sampleCurve(transformTrack.position);
                if (position && position.dimension === 3)
                {
                    tracks.push(new THREE.VectorKeyframeTrack(
                        `${transformTrack.name}.position`,
                        toTimesArray(position.times),
                        toValuesArray(position.values)
                    ));
                }

                const orientation = sampleCurve(transformTrack.orientation);
                if (orientation && orientation.dimension === 4)
                {
                    tracks.push(new THREE.QuaternionKeyframeTrack(
                        `${transformTrack.name}.quaternion`,
                        toTimesArray(orientation.times),
                        toValuesArray(orientation.values)
                    ));
                }

                const scaleTrack = scaleCurveToVector3Track(transformTrack.scaleShear, `${transformTrack.name}.scale`);
                if (scaleTrack) tracks.push(scaleTrack);
            }
        }

        if (tracks.length)
        {
            clips.push(new THREE.AnimationClip(animation.name, animation.duration, tracks));
        }
    }

    return clips;
}
