import { HardDrive } from "lucide-react";
import {
	Label,
	PolarGrid,
	PolarRadiusAxis,
	RadialBar,
	RadialBarChart,
} from "recharts";

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";

interface VolumeMetric {
	path: string;
	usedPercent: number;
	usedGB: number;
	totalGB: number;
}

interface VolumesChartProps {
	volumes: VolumeMetric[] | undefined;
}

const chartConfig = {
	volume: {
		label: "Volume",
		color: "hsl(var(--chart-3))",
	},
} satisfies ChartConfig;

function VolumeGauge({ volume }: { volume: VolumeMetric }) {
	const chartData = [
		{ volume: volume.usedPercent, fill: "hsl(var(--chart-3))" },
	];
	const endAngle = (volume.usedPercent * 360) / 100;

	return (
		<Card className="flex flex-col bg-transparent">
			<CardHeader className="items-center border-b pb-5">
				<CardTitle className="truncate max-w-full" title={volume.path}>
					{volume.path}
				</CardTitle>
				<CardDescription>Storage Space</CardDescription>
			</CardHeader>
			<CardContent className="flex-1 pb-0">
				<ChartContainer
					config={chartConfig}
					className="mx-auto aspect-square max-h-[250px]"
				>
					<RadialBarChart
						data={chartData}
						startAngle={0}
						endAngle={endAngle}
						innerRadius={80}
						outerRadius={110}
					>
						<PolarGrid
							gridType="circle"
							radialLines={false}
							stroke="none"
							className="first:fill-muted last:fill-background"
							polarRadius={[86, 74]}
						/>
						<RadialBar
							dataKey="volume"
							background
							cornerRadius={10}
							fill="hsl(var(--chart-3))"
						/>
						<PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
							<Label
								content={({ viewBox }) => {
									if (viewBox && "cx" in viewBox && "cy" in viewBox) {
										return (
											<text
												x={viewBox.cx}
												y={viewBox.cy}
												textAnchor="middle"
												dominantBaseline="middle"
											>
												<tspan
													x={viewBox.cx}
													y={viewBox.cy}
													className="fill-foreground text-4xl font-bold"
												>
													{volume.usedPercent.toFixed(1)}%
												</tspan>
												<tspan
													x={viewBox.cx}
													y={(viewBox.cy || 0) + 24}
													className="fill-muted-foreground text-sm"
												>
													Used
												</tspan>
											</text>
										);
									}
								}}
							/>
						</PolarRadiusAxis>
					</RadialBarChart>
				</ChartContainer>
			</CardContent>
			<CardFooter className="flex-col gap-2 text-sm">
				<div className="flex items-center gap-2 font-medium leading-none">
					<HardDrive className="h-4 w-4" /> {volume.usedGB.toFixed(1)} GB used
				</div>
				<div className="leading-none text-muted-foreground">
					Of {volume.totalGB.toFixed(1)} GB total
				</div>
			</CardFooter>
		</Card>
	);
}

export function VolumesChart({ volumes }: VolumesChartProps) {
	if (!volumes || volumes.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 col-span-full">
			{volumes.map((volume) => (
				<VolumeGauge key={volume.path} volume={volume} />
			))}
		</div>
	);
}
