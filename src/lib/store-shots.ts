/**
 * App Store screenshot builds only (tools/store_shots.sh sets
 * EXPO_PUBLIC_STORE_SHOTS=1 when it bundles the app for the Simulator). The
 * app then opens filled with the 3-year sample as if it were real data, with
 * Pro on and the sample banners off, and a few screens read a `shot` link
 * parameter to show the part being photographed. Every other build has this
 * false, and the code behind it is left out of the bundle.
 */
export const STORE_SHOTS = process.env.EXPO_PUBLIC_STORE_SHOTS === '1';
